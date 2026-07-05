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
let recordingResolve = null;

/**
 * Check if the browser supports audio recording.
 * @returns {boolean}
 */
export function isRecordingSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/**
 * Start recording audio from the user's microphone.
 * Resolves when stopRecording() is called, returning a Blob.
 * @returns {Promise<Blob>} The recorded audio as a Blob (webm or ogg).
 */
export async function startRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    throw new Error("Already recording");
  }

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
    recordingResolve = resolve;
    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, {
        type: mediaRecorder.mimeType || "audio/webm",
      });
      // Stop all tracks to release the mic
      stream.getTracks().forEach((t) => t.stop());
      audioChunks = [];
      resolve(blob);
    };
  });

  mediaRecorder.start();
  return recordingPromise;
}

/**
 * Stop the current recording. The Promise returned by startRecording()
 * will resolve with the audio Blob.
 */
export function stopRecording() {
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
