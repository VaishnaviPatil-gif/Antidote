import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Mic, Square, Loader2, Volume2, X, Sparkles } from "lucide-react";
import { C } from "../theme.js";
import { useVoiceAssistant } from "../hooks/useVoiceAssistant.js";

/**
 * VoiceFab — the always-available floating microphone.
 *
 * Mounted once inside the app Shell so the voice assistant reaches EVERY screen
 * in the emergency flow, not just the dedicated /assistant page. A panicked user
 * (or a bystander) can talk to the app from wherever they are and be navigated
 * to the right screen automatically. It shares useVoiceAssistant with the full
 * page, so behaviour (auto-stop on silence, personalised replies, intent →
 * navigation) is identical.
 *
 * Rendered inside Shell's `relative` frame, so it floats within the 430px app
 * card rather than the viewport edge on desktop. It hides itself on:
 *   - /assistant — that page already owns a full-screen mic (two live recorders
 *     would fight over the microphone).
 */

const HIDE_ON = new Set(["/assistant"]);

const UI = {
  en: { open: "Ask", listen: "Listening…", think: "Thinking…", speak: "Speaking…",
        hint: "Tap and speak — I'll take you where you need to go.",
        net: "Couldn't reach the assistant. Try again.",
        mic: "Microphone is off. Enable it in settings.",
        stt: "I didn't catch that — tap and try again.", you: "You" },
  hi: { open: "पूछें", listen: "सुन रहा हूँ…", think: "सोच रहा हूँ…", speak: "बोल रहा हूँ…",
        hint: "दबाकर बोलें — मैं सही जगह ले चलूँगा।",
        net: "असिस्टेंट तक नहीं पहुँच सका। फिर कोशिश करें।",
        mic: "माइक्रोफ़ोन बंद है। सेटिंग्स में चालू करें।",
        stt: "समझ नहीं पाया — दबाकर फिर बोलें।", you: "आप" },
  te: { open: "అడగండి", listen: "వింటున్నాను…", think: "ఆలోచిస్తున్నాను…", speak: "మాట్లాడుతున్నాను…",
        hint: "నొక్కి మాట్లాడండి — సరైన చోటుకు తీసుకెళ్తాను.",
        net: "అసిస్టెంట్‌ను చేరలేకపోయాం. మళ్లీ ప్రయత్నించండి.",
        mic: "మైక్రోఫోన్ ఆఫ్‌లో ఉంది. సెట్టింగ్స్‌లో ఆన్ చేయండి.",
        stt: "నాకు అర్థం కాలేదు — నొక్కి మళ్లీ మాట్లాడండి.", you: "మీరు" },
};

const ERR_KEY = { net: "net", mic: "mic", stt: "stt" };

export default function VoiceFab() {
  const { pathname } = useLocation();
  const { language, status, error, messages, supported, toggle, reset } = useVoiceAssistant();
  const [open, setOpen] = useState(false);
  const lang = UI[language] ? language : "en";
  const t = UI[lang];

  // Auto-open the panel whenever there is something to show (active turn / reply
  // / error), so a spoken exchange started from the FAB is always visible.
  useEffect(() => {
    if (status !== "idle" || messages.length || error) setOpen(true);
  }, [status, messages.length, error]);

  const lastBot = useRef(null);
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastReply = [...messages].reverse().find((m) => m.role === "bot");
  lastBot.current = lastReply?.text || lastBot.current;

  if (HIDE_ON.has(pathname) || !supported) return null;

  const statusText =
    status === "recording" ? t.listen
    : status === "processing" ? t.think
    : status === "speaking" ? t.speak
    : null;
  const errText = error ? t[ERR_KEY[error]] : "";

  const handleTap = () => {
    if (!open) setOpen(true);
    toggle();
  };
  const close = () => { reset(); setOpen(false); };

  return (
    <div
      className="absolute z-40 flex flex-col items-end gap-2"
      style={{ right: 14, bottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }}
    >
      {/* Compact conversation panel */}
      {open && (
        <div
          className="ap-fade-up w-64 max-w-[78vw] rounded-2xl p-3 shadow-lg"
          style={{ background: "#fff", border: `1px solid ${C.tealPale}`, boxShadow: "0 10px 30px rgba(10,79,79,.20)" }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles size={14} style={{ color: C.teal }} />
            <span className="text-[12px] font-extrabold" style={{ color: C.teal }}>Antidote+</span>
            <button
              onClick={close}
              aria-label="Close"
              className="ml-auto -mr-1 -mt-1 p-1 rounded-full active:scale-90 transition-transform"
              style={{ color: C.muted }}
            >
              <X size={15} />
            </button>
          </div>

          {lastUser && (
            <div className="text-[11px] mb-1" style={{ color: C.muted }}>
              <span className="font-bold">{t.you}: </span>{lastUser.text}
            </div>
          )}

          {errText ? (
            <div className="text-[12.5px] font-semibold leading-snug" style={{ color: C.danger }}>{errText}</div>
          ) : statusText && status !== "speaking" && !lastReply ? (
            <div className="text-[12.5px] font-semibold" style={{ color: C.muted }}>{statusText}</div>
          ) : lastBot.current ? (
            <div className="text-[13px] leading-snug" style={{ color: C.dark }}>{lastBot.current}</div>
          ) : (
            <div className="text-[12.5px] leading-snug" style={{ color: C.muted }}>{t.hint}</div>
          )}

          {statusText && (
            <div className="mt-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: C.tealLight }}>
              {statusText}
            </div>
          )}
        </div>
      )}

      {/* The floating mic */}
      <button
        onClick={handleTap}
        aria-label={t.open}
        className={`relative w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-all ${
          status === "recording" || status === "speaking" ? "ap-breathe" : ""
        }`}
        style={{
          background: status === "recording" ? C.danger : C.teal,
          boxShadow: status === "recording" ? `0 8px 24px ${C.danger}66` : `0 8px 22px ${C.teal}55`,
        }}
      >
        {/* Ripple while recording */}
        {status === "recording" && [0, 0.7].map((d, i) => (
          <span key={i} className="ap-ring absolute inset-0 rounded-full"
                style={{ background: C.danger, animationDelay: `${d}s` }} />
        ))}
        {status === "recording" ? <Square size={20} color="#fff" fill="#fff" />
          : status === "processing" ? <Loader2 size={22} color="#fff" className="ap-spin" />
          : status === "speaking" ? <Volume2 size={22} color="#fff" />
          : <Mic size={22} color="#fff" />}
      </button>
    </div>
  );
}
