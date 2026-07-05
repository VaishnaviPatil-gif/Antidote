import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock, Check, X, Camera, ChevronRight, SkipForward, HeartPulse,
  Play, Pause, RotateCcw, Volume2, VolumeX,
} from "lucide-react";
import { C } from "../theme.js";
import { tFor } from "../i18n.js";
import { useEmergency } from "../context/EmergencyContext.jsx";
import BackButton from "../components/BackButton.jsx";
import { speak as speakTts, stop as stopTts, isTtsAvailable } from "../lib/ttsService.js";

/**
 * First aid (§2.4) — shown immediately, while the victim moves toward care.
 *
 * Medically-correct DO / DON'T lists come verbatim from the shared i18n
 * tables (the spec copy — never invented here). A live "time since bite"
 * timer reads biteTime from EmergencyContext (the single source of truth;
 * no duplicated state). The snake photo is strictly optional: the primary CTA
 * continues to it, the secondary CTA skips straight to the severity tracker.
 */
export default function FirstAid() {
  const navigate = useNavigate();
  const { biteTime, language, setLanguage } = useEmergency();
  const t = tFor(language);

  // Live clock — the only local state here, and it is purely presentational.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = biteTime
    ? Math.max(0, Math.floor((now.getTime() - new Date(biteTime).getTime()) / 1000))
    : null;
  const mm = elapsedSec != null ? Math.floor(elapsedSec / 60) : null;
  const ss = elapsedSec != null ? elapsedSec % 60 : null;
  const clock =
    elapsedSec != null ? `${mm}:${String(ss).padStart(2, "0")}` : "—:—";

  // ── Voice-guided first aid (via ttsService) ────────────────────
  // All speech goes through ttsService, which uses the native OS text-to-speech
  // engine inside the Capacitor Android/iOS shell and falls back to the browser
  // speechSynthesis on web. This screen no longer touches window.speechSynthesis
  // directly. Missing regional voices fall back to English inside the service,
  // so a real device never shows "voice unavailable".
  const [voiceStatus, setVoiceStatus] = useState("idle"); // idle | playing
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1);
  const playIdRef = useRef(0);
  const isPlaying = voiceStatus === "playing";
  const ttsAvailable = isTtsAvailable();

  // Full ordered guidance (title → DO list → DON'T list), rebuilt per language.
  const sentences = useMemo(() => [
    t.firstAid.title,
    t.firstAid.doTitle,
    ...t.firstAid.doItems,
    t.firstAid.dontTitle,
    ...t.firstAid.dontItems,
  ], [t]);

  // Localised status labels (kept trilingual like the rest of the UI).
  const voiceLabels = {
    en: { idle: "Play voice guide", playing: "Playing…", unavailable: "Voice not available on this device" },
    hi: { idle: "वॉयस गाइड चलाएँ", playing: "चल रहा है…", unavailable: "इस डिवाइस पर वॉयस उपलब्ध नहीं" },
    te: { idle: "వాయిస్ గైడ్ ప్లే చేయండి", playing: "ప్లే అవుతోంది…", unavailable: "ఈ పరికరంలో వాయిస్ అందుబాటులో లేదు" },
  };
  const labels = voiceLabels[language] || voiceLabels.en;
  const vLabel = !ttsAvailable ? labels.unavailable : isPlaying ? labels.playing : labels.idle;

  // Stop playback and clear the highlight. Bumping playIdRef invalidates any
  // in-flight sentence chain so it can't resume after we stop.
  const stopVoice = useCallback(() => {
    playIdRef.current += 1;
    stopTts();
    setVoiceStatus("idle");
    setCurrentSentenceIndex(-1);
  }, []);

  // Speak the whole guidance one sentence at a time so the current line can be
  // highlighted. The monotonic playId guarantees no overlapping speech: any
  // stop / language-switch / re-tap supersedes the running chain.
  const startVoice = useCallback(async () => {
    await stopTts(); // never overlap with a previous run
    const myId = ++playIdRef.current;
    setVoiceStatus("playing");
    for (let i = 0; i < sentences.length; i++) {
      if (playIdRef.current !== myId) return; // superseded or stopped
      setCurrentSentenceIndex(i);
      await speakTts(sentences[i], language); // falls back to English internally
    }
    if (playIdRef.current === myId) {
      setVoiceStatus("idle");
      setCurrentSentenceIndex(-1);
    }
  }, [sentences, language]);

  // First tap → play; second tap → stop.
  const togglePlay = useCallback(() => {
    if (!ttsAvailable) return;
    if (isPlaying) stopVoice();
    else startVoice();
  }, [ttsAvailable, isPlaying, stopVoice, startVoice]);

  const resetSpeech = useCallback(() => stopVoice(), [stopVoice]);

  // Switching language stops playback so the next play uses the new language.
  useEffect(() => {
    stopVoice();
  }, [language, stopVoice]);

  // Stop any speech when leaving the page.
  useEffect(() => {
    return () => { stopTts(); };
  }, []);

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      <BackButton className="self-start" />

      {/* ── Live time since bite ───────────────────────────────── */}
      <div
        className="rounded-2xl bg-white border flex items-center gap-3 px-4 py-3"
        style={{ borderColor: "#E1EAE9" }}
      >
        <div className="rounded-xl p-2 shrink-0" style={{ background: C.tealPale }}>
          <Clock size={20} style={{ color: C.teal }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs" style={{ color: C.muted }}>
            {t.firstAid.timeSince}
          </div>
          {elapsedSec != null ? (
            <div
              className="text-2xl font-extrabold tabular-nums leading-tight"
              style={{ color: C.dark }}
              aria-live="off"
            >
              {clock}
              <span className="text-sm font-semibold ml-1.5" style={{ color: C.muted }}>
                {t.common.min}
              </span>
            </div>
          ) : (
            <div className="text-sm font-semibold" style={{ color: C.amber }}>
              {t.firstAid.notStarted}
            </div>
          )}
        </div>
        <HeartPulse size={20} style={{ color: C.tealLight }} className="shrink-0" />
      </div>

      {/* ── Voice-Guided First Aid (hero) ──────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: `linear-gradient(140deg, ${C.tealLight} 0%, ${C.teal} 55%, ${C.tealDark} 100%)`,
          boxShadow: "0 12px 30px rgba(10,79,79,.28)",
        }}
      >
        <style>{`
          @keyframes apEq { 0%,100%{transform:scaleY(.32)} 50%{transform:scaleY(1)} }
          @keyframes apRing { 0%{transform:scale(.85);opacity:.65} 70%,100%{transform:scale(1.7);opacity:0} }
        `}</style>

        {/* Header + status + equalizer */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,.16)", width: 38, height: 38 }}
            >
              <Volume2 size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold leading-tight">
                {language === "te" ? "వాయిస్ ప్రథమ చికిత్స" : language === "hi" ? "वॉयस प्राथमिक चिकित्सा" : "Voice First-Aid Guide"}
              </div>
              <div className="text-[11px] font-semibold truncate" style={{ color: "#CDEFEC" }} aria-live="polite">
                {vLabel}
              </div>
            </div>
          </div>

          {isPlaying ? (
            <div className="flex items-end gap-[3px] h-6 shrink-0" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="w-[3.5px] rounded-full"
                  style={{
                    height: "100%",
                    background: "#fff",
                    transformOrigin: "bottom",
                    animation: `apEq ${0.7 + (i % 3) * 0.18}s ease-in-out ${i * 0.09}s infinite`,
                  }}
                />
              ))}
            </div>
          ) : (
            <HeartPulse size={20} className="shrink-0" style={{ color: "#BFE3E1" }} />
          )}
        </div>

        {/* Live sentence being spoken */}
        <div className="px-4">
          <div
            className="rounded-xl px-3 py-2.5 text-sm font-semibold leading-snug min-h-[46px] flex items-center transition-all text-white"
            style={{ background: "rgba(255,255,255,.14)" }}
          >
            {currentSentenceIndex >= 0
              ? sentences[currentSentenceIndex]
              : language === "te"
              ? "దశలను వినడానికి ప్లే నొక్కండి"
              : language === "hi"
              ? "चरण सुनने के लिए प्ले दबाएँ"
              : "Press play to hear each step aloud"}
          </div>
        </div>

        {/* Progress through the guide */}
        <div className="px-4 pt-3">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.22)" }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${sentences.length ? Math.round(((currentSentenceIndex + 1) / sentences.length) * 100) : 0}%`,
                background: C.orange,
              }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="px-4 py-4 flex items-center justify-center gap-6">
          <button
            onClick={resetSpeech}
            disabled={currentSentenceIndex === -1}
            aria-label="Reset"
            className="rounded-full w-11 h-11 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
            style={{ background: "rgba(255,255,255,.16)", color: "#fff" }}
          >
            <RotateCcw size={18} />
          </button>

          <div className="relative flex items-center justify-center">
            {isPlaying && (
              <span
                className="absolute rounded-full"
                style={{ width: 64, height: 64, background: "rgba(255,255,255,.35)", animation: "apRing 1.6s ease-out infinite" }}
              />
            )}
            <button
              onClick={togglePlay}
              disabled={!ttsAvailable}
              aria-label={isPlaying ? "Stop" : "Play"}
              className="relative rounded-full w-16 h-16 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
              style={{ background: "#fff", color: C.teal, boxShadow: "0 6px 16px rgba(0,0,0,.22)" }}
            >
              {isPlaying ? <Pause size={26} fill={C.teal} /> : <Play size={26} fill={C.teal} className="ml-0.5" />}
            </button>
          </div>

          {/* Balances the reset button so play stays centred. */}
          <div className="w-11 h-11" aria-hidden="true" />
        </div>

        {/* Language selector */}
        <div className="px-4 pb-4 grid grid-cols-3 gap-2">
          {[
            { key: "en", label: "English" },
            { key: "hi", label: "हिन्दी" },
            { key: "te", label: "తెలుగు" },
          ].map((lng) => {
            const active = language === lng.key;
            return (
              <button
                key={lng.key}
                onClick={() => setLanguage(lng.key)}
                className="rounded-xl py-2 text-xs font-bold active:scale-95 transition-all"
                style={{
                  background: active ? "#fff" : "rgba(255,255,255,.12)",
                  color: active ? C.teal : "#EAF7F6",
                  border: active ? "none" : "1px solid rgba(255,255,255,.18)",
                }}
              >
                {lng.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Title ──────────────────────────────────────────────── */}
      <h1 className="text-lg font-extrabold leading-tight" style={{ color: C.dark }}>
        {t.firstAid.title}
      </h1>

      {/* ── DO ─────────────────────────────────────────────────── */}
      <section
        className="rounded-2xl overflow-hidden border"
        style={{ borderColor: "#CFE7DC" }}
      >
        <div
          className="px-4 py-2 flex items-center gap-2 text-white"
          style={{ background: C.good }}
        >
          <Check size={18} strokeWidth={3} />
          <span className="text-sm font-bold uppercase tracking-wide">
            {t.firstAid.doTitle}
          </span>
        </div>
        <ul className="bg-white px-4 py-3 space-y-2.5">
          {t.firstAid.doItems.map((item, i) => {
            const isSpeaking = currentSentenceIndex === 2 + i;
            return (
              <li
                key={i}
                className="flex items-start gap-2.5 p-1.5 rounded-lg transition-all duration-300"
                style={{ background: isSpeaking ? C.goodPale : "transparent" }}
              >
                <span
                  className="rounded-full p-0.5 shrink-0 mt-0.5"
                  style={{ background: isSpeaking ? "#fff" : C.goodPale }}
                >
                  <Check size={14} strokeWidth={3} style={{ color: C.good }} />
                </span>
                <span className="text-sm leading-snug font-semibold" style={{ color: C.dark }}>
                  {item}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── DON'T (these kill — shown clearly) ─────────────────── */}
      <section
        className="rounded-2xl overflow-hidden border"
        style={{ borderColor: "#F0CFC9" }}
      >
        <div
          className="px-4 py-2 flex items-center gap-2 text-white"
          style={{ background: C.danger }}
        >
          <X size={18} strokeWidth={3} />
          <span className="text-sm font-bold uppercase tracking-wide">
            {t.firstAid.dontTitle}
          </span>
        </div>
        <ul className="px-4 py-3 space-y-2.5" style={{ background: C.dangerPale }}>
          {t.firstAid.dontItems.map((item, i) => {
            const isSpeaking = currentSentenceIndex === 3 + t.firstAid.doItems.length + i;
            return (
              <li
                key={i}
                className="flex items-start gap-2.5 p-1.5 rounded-lg transition-all duration-300"
                style={{ background: isSpeaking ? "#FCE4E0" : "transparent" }}
              >
                <span
                  className="rounded-full p-0.5 shrink-0 mt-0.5"
                  style={{ background: isSpeaking ? "#fff" : "#F6D9D4" }}
                >
                  <X size={14} strokeWidth={3} style={{ color: C.danger }} />
                </span>
                <span className="text-sm font-bold leading-snug" style={{ color: C.dark }}>
                  {item}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* English-marker note for the longer guidance. */}
      <p className="text-xs leading-snug" style={{ color: C.muted }}>
        {t.firstAid.note}
      </p>

      {/* ── CTAs — photo stays optional, never blocks the flow ──── */}
      <div className="flex flex-col gap-2 pt-1">
        <button
          onClick={() => navigate("/snake")}
          className="w-full rounded-xl text-white font-bold flex items-center justify-center gap-2 active:scale-[.98] transition-transform"
          style={{ background: C.teal, height: 54, fontSize: 16 }}
        >
          <Camera size={18} />
          {t.firstAid.continueSnake}
          <ChevronRight size={18} />
        </button>

        <button
          onClick={() => navigate("/tracker")}
          className="w-full rounded-xl border font-semibold flex items-center justify-center gap-2 active:scale-[.98] transition-transform"
          style={{ borderColor: C.teal, color: C.teal, height: 50, fontSize: 15, background: "#fff" }}
        >
          <SkipForward size={16} />
          {t.firstAid.skipPhoto}
        </button>
      </div>
    </div>
  );
}
