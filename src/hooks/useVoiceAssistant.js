import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEmergency, minutesSinceBite } from "../context/EmergencyContext.jsx";
import { fetchHospitals } from "../lib/hospitals.js";
import { haversineKm, etaMin, RURAL_SPEED_KMH } from "../lib/geo.js";
import {
  isRecordingSupported, startRecording, stopRecording,
  speechToText, sendVoiceReply, playAudioBase64, stopAudio,
} from "../lib/voiceChatService.js";
import * as haptics from "../lib/haptics.js";

/**
 * useVoiceAssistant — the shared brain behind BOTH the full Voice Assistant page
 * and the global floating mic. Centralising it here means one recording state
 * machine, one context builder, and one navigation policy — the page and the FAB
 * can never drift apart.
 *
 * The loop is hands-free by design (one tap + silence auto-stop):
 *   tap → record → (VAD detects you stopped) → STT (transcript shown instantly)
 *       → /api/voice-reply (Gemini + TTS) → speak the reply AND, on an
 *       actionable intent, navigate to that screen.
 *
 * `status`: "idle" | "recording" | "processing" | "speaking".
 * `error`:  null | "net" | "mic" | "stt"  (consumers localise the code).
 */

// Actionable intents that move the user to another screen. first_aid /
// hospital_stock / none just talk.
export const ACTION_ROUTE = {
  route_hospital: "/routing",
  sos: "/sos",
  identify_snake: "/snake",
  track_symptoms: "/tracker",
};

// How long to let the spoken confirmation begin before we navigate (audio keeps
// playing across the SPA route change, so the confirmation is still heard).
const NAV_DELAY_MS = 1400;

export function useVoiceAssistant() {
  const navigate = useNavigate();
  const {
    language, victimLocation, biteTime, severity, snake, symptomLog,
  } = useEmergency();

  const [messages, setMessages] = useState([]); // {role:"user"|"bot", text, action?}
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null); // "net" | "mic" | "stt" | null
  const supported = isRecordingSupported();

  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // ── Live app context (hospital stock + this patient's state) ───────────────
  // Rebuilt whenever the inputs change so the assistant always reasons over the
  // freshest data — real vial counts AND how this specific patient is doing.
  const contextRef = useRef(null);
  const patientRef = useRef(null);

  // Patient slice is cheap and always available — keep it current every render.
  useEffect(() => {
    const last = symptomLog && symptomLog.length ? symptomLog[symptomLog.length - 1] : null;
    const mins = minutesSinceBite(biteTime);
    patientRef.current = {
      mins_since_bite: mins == null ? undefined : mins,
      severity: severity || undefined,
      snake: snake?.species && snake.species !== "Unidentified" ? snake.species : undefined,
      venomous: snake ? snake.venomous !== false : undefined,
      symptoms: last?.answers || undefined,
    };
    if (contextRef.current) contextRef.current.patient = patientRef.current;
  }, [biteTime, severity, snake, symptomLog]);

  // Hospital slice needs a fetch — refresh when location changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!victimLocation) {
        contextRef.current = { patient: patientRef.current };
        return;
      }
      try {
        const { facilities } = await fetchHospitals();
        const ranked = facilities
          .map((f) => {
            const km = haversineKm(victimLocation, f);
            return {
              name: f.name, vials: f.vials, km: Math.round(km * 10) / 10,
              eta_min: etaMin(km, RURAL_SPEED_KMH), sector: f.sector,
            };
          })
          .sort((a, b) => a.km - b.km);
        const recommended = ranked.find((h) => h.vials > 0) || ranked[0] || null;
        if (!cancelled) {
          contextRef.current = { hospitals: ranked, recommended, patient: patientRef.current };
        }
      } catch {
        if (!cancelled) contextRef.current = { patient: patientRef.current };
      }
    })();
    return () => { cancelled = true; };
  }, [victimLocation]);

  // Stop playback if the consumer unmounts mid-sentence.
  useEffect(() => () => { stopAudio(); }, []);

  const runAssistant = useCallback(async (blob) => {
    setStatus("processing");
    try {
      // STEP 1 — transcribe. Show the user's words the instant STT returns,
      // before Gemini + TTS finish, so the UI never feels stuck.
      const stt = await speechToText(blob);
      const transcript = (stt?.transcript || "").trim();
      if (!transcript) {
        setError("stt");
        setStatus("idle");
        return;
      }
      const detectedLang = stt.language || "te-IN";
      setMessages((m) => [...m, { role: "user", text: transcript }]);

      // STEP 2 — reply (Gemini) + audio (TTS) in one call.
      const history = messagesRef.current.slice(-6).map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        text: m.text,
      }));
      const res = await sendVoiceReply(
        transcript, detectedLang, history, contextRef.current
      );

      setMessages((m) => [
        ...m,
        { role: "bot", text: res.ai_response, action: res.action },
      ]);

      const route = ACTION_ROUTE[res.action];
      if (route) {
        haptics.success();
        setTimeout(() => navigate(route), NAV_DELAY_MS);
      }

      setStatus("speaking");
      playAudioBase64(res.audio_base64)
        .catch(() => {})
        .finally(() => setStatus((s) => (s === "speaking" ? "idle" : s)));
    } catch (e) {
      console.warn("[assistant]", e);
      setError("net");
      setStatus("idle");
    }
  }, [navigate]);

  const start = useCallback(async () => {
    setError(null);
    stopAudio();
    haptics.tap();
    try {
      const blob = await startRecording({
        // Hands-free: silence auto-stops the mic and flips us to "processing".
        onAutoStop: () => setStatus("processing"),
      });
      await runAssistant(blob);
    } catch (e) {
      console.warn("[assistant] mic", e);
      setError("mic");
      setStatus("idle");
    }
  }, [runAssistant]);

  /** Single control for the mic button: start / stop / interrupt-and-restart. */
  const toggle = useCallback(() => {
    if (status === "processing") return;
    if (status === "recording") {
      haptics.tap();
      setStatus("processing");
      stopRecording(); // resolves the blob promise awaited in start()
      return;
    }
    // idle or speaking (barge-in) → begin a fresh capture.
    setStatus("recording");
    start();
  }, [status, start]);

  /** Clear the transcript (e.g. when closing the floating panel). */
  const reset = useCallback(() => {
    stopAudio();
    stopRecording();
    setMessages([]);
    setError(null);
    setStatus("idle");
  }, []);

  return {
    language, status, error, messages, supported,
    toggle, reset,
    busy: status === "processing",
  };
}
