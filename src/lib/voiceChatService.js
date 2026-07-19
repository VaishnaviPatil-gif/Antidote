/**
 * voiceChatService — frontend client for the voice-chat API endpoints.
 *
 * Handles:
 *   • Recording audio from the user's microphone (MediaRecorder API)
 *   • Sending audio to /api/voice-chat (full loop: STT → Gemini → TTS)
 *   • Sending text to /api/tts for standalone text-to-speech
 *   • Playing base64-encoded audio responses
 *
 * The Sarvam API key stays server-side — this module only talks to the
 * FastAPI backend, consistent with the existing proxy pattern.
 */

const API_BASE = (import.meta.env?.VITE_API_BASE ?? "").replace(/\/+$/, "");

// ── Audio Recording ─────────────────────────────────────────────────────────

let mediaRecorder = null;
let audioChunks = [];
let vadCleanup = null; // tears down the Web Audio silence detector, if any

/**
 * Check if the browser supports audio recording.
 * @returns {boolean}
 */
export function isRecordingSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/**
 * Attach a voice-activity detector to a live mic stream. Watches the microphone
 * energy (RMS of the time-domain waveform) and, once the user has actually
 * spoken, fires `onSilence` after `silenceMs` of continuous quiet — enabling
 * true hands-free "tap once, speak, done" without a second tap. A hard `maxMs`
 * cap fires `onSilence` too, so a stuck-open mic (or constant background noise)
 * never records forever.
 *
 * Returns a cleanup function that stops the analyser and releases its nodes.
 * Best-effort: if the Web Audio API is unavailable it returns a no-op and the
 * caller simply falls back to manual tap-to-stop.
 */
function attachSilenceDetector(stream, { onSilence, silenceMs, maxMs }) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return () => {};

  let ctx;
  try {
    ctx = new AC();
  } catch {
    return () => {};
  }

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);

  // Speech must cross SPEAK_RMS before silence-tracking begins, so the timer
  // never trips during the initial quiet gap before the user starts talking.
  const SPEAK_RMS = 0.035;
  const SILENCE_RMS = 0.02;
  const started = Date.now();
  let hasSpoken = false;
  let quietSince = 0;
  let raf = 0;
  let done = false;

  const fire = () => {
    if (done) return;
    done = true;
    onSilence?.();
  };

  const tick = () => {
    if (done) return;
    analyser.getByteTimeDomainData(buf);
    // RMS around the 128 midpoint, normalised to ~0..1.
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    const now = Date.now();

    if (rms > SPEAK_RMS) {
      hasSpoken = true;
      quietSince = 0;
    } else if (hasSpoken && rms < SILENCE_RMS) {
      if (!quietSince) quietSince = now;
      else if (now - quietSince >= silenceMs) return fire();
    }

    if (now - started >= maxMs) return fire();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    done = true;
    if (raf) cancelAnimationFrame(raf);
    try { source.disconnect(); } catch { /* already gone */ }
    try { ctx.close(); } catch { /* already closed */ }
  };
}

/**
 * Start recording audio from the user's microphone.
 * Resolves when stopRecording() is called (or silence auto-stops it),
 * returning a Blob.
 *
 * @param {object} [opts]
 * @param {() => void} [opts.onAutoStop] - Called when silence detection stops
 *   the recording on its own, so the UI can reflect the transition to
 *   "processing" without a manual tap. Auto-stop is enabled only when provided.
 * @param {number} [opts.silenceMs=1500] - Quiet duration (after speech) that
 *   ends the recording.
 * @param {number} [opts.maxMs=12000] - Hard cap on recording length.
 * @returns {Promise<Blob>} The recorded audio as a Blob (webm or ogg).
 */
export async function startRecording(opts = {}) {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    throw new Error("Already recording");
  }
  const { onAutoStop = null, silenceMs = 1500, maxMs = 12000 } = opts;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // Prefer webm (Chrome/Edge) → ogg (Firefox) → fallback
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
    ? "audio/ogg;codecs=opus"
    : "";

  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
  audioChunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  const recordingPromise = new Promise((resolve) => {
    mediaRecorder.onstop = () => {
      if (vadCleanup) { vadCleanup(); vadCleanup = null; }
      const blob = new Blob(audioChunks, {
        type: mediaRecorder.mimeType || "audio/webm",
      });
      // Stop all tracks to release the mic
      stream.getTracks().forEach((t) => t.stop());
      audioChunks = [];
      resolve(blob);
    };
  });

  // Hands-free auto-stop. When silence is detected we notify the UI first, then
  // stop the recorder (which resolves the promise above with the captured blob).
  if (onAutoStop) {
    vadCleanup = attachSilenceDetector(stream, {
      silenceMs,
      maxMs,
      onSilence: () => {
        onAutoStop();
        stopRecording();
      },
    });
  }

  mediaRecorder.start();
  return recordingPromise;
}

/**
 * Stop the current recording. The Promise returned by startRecording()
 * will resolve with the audio Blob.
 */
export function stopRecording() {
  if (vadCleanup) { vadCleanup(); vadCleanup = null; }
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
}

/**
 * True if currently recording.
 * @returns {boolean}
 */
export function isRecording() {
  return mediaRecorder?.state === "recording";
}

// ── API Calls ───────────────────────────────────────────────────────────────

/**
 * Send recorded audio to the full voice-chat loop.
 * Audio → STT → Gemini → TTS → returns { transcript, language, ai_response, audio_base64 }
 *
 * @param {Blob} audioBlob - The recorded audio blob
 * @param {Array<{role: string, text: string}>} [conversationHistory] - Optional chat history
 * @param {number} [timeoutMs=30000] - Request timeout
 * @returns {Promise<{transcript: string, language: string, ai_response: string, audio_base64: string}>}
 */
export async function sendVoiceChat(
  audioBlob,
  conversationHistory = null,
  appContext = null,
  timeoutMs = 30000
) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  if (conversationHistory && conversationHistory.length > 0) {
    formData.append("history", JSON.stringify(conversationHistory));
  }

  // Live app context (e.g. hospital stock) so the assistant can answer factual
  // questions like "how many vials at the nearest hospital?".
  if (appContext) {
    formData.append("context", JSON.stringify(appContext));
  }

  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}/api/voice-chat`, {
      method: "POST",
      body: formData,
      signal: ac.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[voice-chat] HTTP ${res.status}: ${body.slice(0, 200)}`);
      throw new Error(`Voice chat failed: HTTP ${res.status}`);
    }

    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

/**
 * Second half of the two-step voice flow: send the transcript (from
 * speechToText) to /api/voice-reply and get back the AI reply text, the in-app
 * action, and the spoken audio. Splitting STT off lets the caller show the
 * user's words the instant STT returns, instead of waiting on Gemini + TTS.
 *
 * @param {string} text - The transcript to reply to.
 * @param {string} language - Detected language code (e.g. "te-IN").
 * @param {Array<{role:string,text:string}>|null} [history] - Recent turns.
 * @param {object|null} [appContext] - Live app context {hospitals, recommended, patient}.
 * @param {number} [timeoutMs=30000]
 * @returns {Promise<{ai_response:string, action:string, audio_base64:string, language:string}>}
 */
export async function sendVoiceReply(
  text,
  language,
  history = null,
  appContext = null,
  timeoutMs = 30000
) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/api/voice-reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        language: language || "te-IN",
        history: history && history.length ? history : null,
        context: appContext || null,
      }),
      signal: ac.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[voice-reply] HTTP ${res.status}: ${body.slice(0, 200)}`);
      throw new Error(`Voice reply failed: HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

/**
 * Convert text to speech using the backend TTS endpoint.
 * @param {string} text - Text to speak
 * @param {string} [language="te-IN"] - Language code
 * @param {string} [speaker="meera"] - Voice name
 * @returns {Promise<string>} Base64-encoded MP3 audio
 */
export async function textToSpeech(
  text,
  language = "te-IN",
  speaker = "priya"
) {
  const res = await fetch(`${API_BASE}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language, speaker }),
  });

  if (!res.ok) {
    throw new Error(`TTS failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.audio_base64;
}

/**
 * Transcribe audio using the backend STT endpoint.
 * @param {Blob} audioBlob - Audio to transcribe
 * @returns {Promise<{transcript: string, language: string}>}
 */
export async function speechToText(audioBlob) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  const res = await fetch(`${API_BASE}/api/stt`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`STT failed: HTTP ${res.status}`);
  }

  return await res.json();
}

// ── Audio Playback ──────────────────────────────────────────────────────────

let currentAudio = null;

/**
 * Play base64-encoded audio (MP3). Stops any currently playing audio first.
 * @param {string} base64Audio - Base64-encoded audio data
 * @returns {Promise<void>} Resolves when playback finishes
 */
export function playAudioBase64(base64Audio) {
  return new Promise((resolve, reject) => {
    if (!base64Audio) {
      resolve();
      return;
    }

    // Stop any currently playing audio
    stopAudio();

    const audioSrc = `data:audio/mpeg;base64,${base64Audio}`;
    currentAudio = new Audio(audioSrc);
    currentAudio.onended = () => {
      currentAudio = null;
      resolve();
    };
    currentAudio.onerror = (e) => {
      currentAudio = null;
      reject(new Error("Audio playback failed"));
    };
    currentAudio.play().catch((err) => {
      currentAudio = null;
      reject(err);
    });
  });
}

/**
 * Stop any currently playing audio.
 */
export function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}

/**
 * True if audio is currently playing.
 * @returns {boolean}
 */
export function isPlaying() {
  return currentAudio !== null && !currentAudio.paused;
}
