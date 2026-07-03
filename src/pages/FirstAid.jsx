import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock, Check, X, Camera, ChevronRight, SkipForward, HeartPulse,
  Play, Pause, RotateCcw, Volume2, VolumeX,
} from "lucide-react";
import { C } from "../theme.js";
import { tFor } from "../i18n.js";
import { useEmergency } from "../context/EmergencyContext.jsx";

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

  // ── Voice Guided First Aid State & Logic ───────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1);

  // Compile full array of instructions
  const sentences = useMemo(() => {
    return [
      t.firstAid.title,
      t.firstAid.doTitle,
      ...t.firstAid.doItems,
      t.firstAid.dontTitle,
      ...t.firstAid.dontItems
    ];
  }, [t]);

  // Cancel speech on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  // Speak a specific sentence index
  const speakSentence = useCallback((index) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    if (index < 0 || index >= sentences.length) {
      setIsPlaying(false);
      setCurrentSentenceIndex(-1);
      return;
    }

    setCurrentSentenceIndex(index);
    const text = sentences[index];
    const utterance = new SpeechSynthesisUtterance(text);

    // Voice language mapping
    let voiceLang = "en-IN";
    if (language === "hi") voiceLang = "hi-IN";
    if (language === "te") voiceLang = "te-IN";

    const voices = window.speechSynthesis.getVoices();
    let voice = voices.find(v => v.lang.toLowerCase().includes(voiceLang.toLowerCase()));
    
    // Fallback if Telugu voice is missing
    if (!voice && language === "te") {
      voice = voices.find(v => v.lang.toLowerCase().includes("hi-in")) || 
              voices.find(v => v.lang.toLowerCase().includes("en-in"));
    }
    
    if (voice) utterance.voice = voice;
    utterance.lang = voiceLang;
    
    utterance.onend = () => {
      setCurrentSentenceIndex((prev) => {
        const next = prev + 1;
        if (next < sentences.length) {
          speakSentence(next);
          return next;
        } else {
          setIsPlaying(false);
          return -1;
        }
      });
    };

    utterance.onerror = () => {
      setIsPlaying(false);
    };

    window.speechSynthesis.speak(utterance);
  }, [sentences, language]);

  // Play / Pause toggler
  const togglePlay = useCallback(() => {
    if (!window.speechSynthesis) return;

    if (isPlaying) {
      window.speechSynthesis.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      } else {
        const startIndex = currentSentenceIndex >= 0 ? currentSentenceIndex : 0;
        speakSentence(startIndex);
      }
    }
  }, [isPlaying, currentSentenceIndex, speakSentence]);

  // Reset speech completely
  const resetSpeech = useCallback(() => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setCurrentSentenceIndex(-1);
  }, []);

  // Stop speech when language is switched
  useEffect(() => {
    resetSpeech();
  }, [language, resetSpeech]);

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
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

      {/* ── Voice Guided Control Panel ─────────────────────────── */}
      <div
        className="rounded-2xl bg-white border p-4 flex flex-col gap-4 shadow-sm"
        style={{ borderColor: "#E1EAE9" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 size={18} style={{ color: C.teal }} />
            <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: C.dark }}>
              {language === "te" ? "ప్రథమ చికిత్స వాయిస్ గైడ్" : language === "hi" ? "प्राथमिक चिकित्सा वॉयस गाइड" : "Voice First Aid Guide"}
            </span>
          </div>
          {isPlaying && (
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: C.good }}></span>
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: C.good }}></span>
            </span>
          )}
        </div>

        {/* Large Control Buttons */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={resetSpeech}
            disabled={currentSentenceIndex === -1}
            aria-label="Reset Voice"
            className="rounded-full w-11 h-11 flex items-center justify-center border active:scale-95 transition-transform disabled:opacity-40"
            style={{ borderColor: "#C5DBD9", background: "#fff", color: C.teal }}
          >
            <RotateCcw size={18} />
          </button>
          
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause Voice" : "Play Voice"}
            className="rounded-full w-14 h-14 flex items-center justify-center text-white active:scale-95 transition-transform"
            style={{ background: C.teal }}
          >
            {isPlaying ? <Pause size={24} fill="#fff" /> : <Play size={24} fill="#fff" className="ml-1" />}
          </button>
        </div>

        {/* Language selector for Voice guidance */}
        <div className="grid grid-cols-3 gap-2 text-xs font-bold border-t pt-3" style={{ borderColor: "#F2F7F6" }}>
          {[
            { key: "en", label: "English" },
            { key: "hi", label: "हिन्दी" },
            { key: "te", label: "తెలుగు" }
          ].map(lang => (
            <button
              key={lang.key}
              onClick={() => setLanguage(lang.key)}
              className="rounded-xl py-1.5 border active:scale-95 transition-transform"
              style={{
                background: language === lang.key ? C.tealPale : "#fff",
                color: language === lang.key ? C.teal : C.muted,
                borderColor: language === lang.key ? C.teal : "#E1EAE9"
              }}
            >
              {lang.label}
            </button>
          ))}
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
