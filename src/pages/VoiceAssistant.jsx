import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Mic, Square, Loader2, Volume2, MapPin, Send, Camera, Activity,
  ChevronRight, AlertCircle, Sparkles,
} from "lucide-react";
import { C } from "../theme.js";
import BackButton from "../components/BackButton.jsx";
import { stopAudio } from "../lib/voiceChatService.js";
import { useVoiceAssistant } from "../hooks/useVoiceAssistant.js";

/**
 * Voice Assistant (§ conversational entry) — a talking chatbot for the victim.
 *
 * All the recording / STT / Gemini / TTS / navigation logic lives in the shared
 * useVoiceAssistant hook (so this page and the global floating mic behave
 * identically). This component is just the full-screen presentation of that
 * loop: tap the mic → speak → it auto-stops on silence → the reply is shown and
 * spoken → an actionable intent navigates to the right screen.
 *
 * Shortcut chips do the same navigation without the mic — a reliable fallback
 * for a noisy demo hall where speech recognition might struggle.
 */

const ACTION_META = {
  route_hospital: { icon: MapPin, label: { en: "Nearest hospital", hi: "नज़दीकी अस्पताल", te: "సమీప ఆసుపత్రి" } },
  sos: { icon: Send, label: { en: "SOS for help", hi: "SOS मदद", te: "SOS సహాయం" } },
  identify_snake: { icon: Camera, label: { en: "Snake camera", hi: "साँप कैमरा", te: "పాము కెమెరా" } },
  track_symptoms: { icon: Activity, label: { en: "Symptom tracker", hi: "लक्षण ट्रैकर", te: "లక్షణ ట్రాకర్" } },
};

// Tappable shortcuts (mic-free fallback). first_aid goes to the first-aid screen.
const SHORTCUTS = [
  { action: "route_hospital", icon: MapPin, label: { en: "Take me to a hospital", hi: "मुझे अस्पताल ले चलो", te: "నన్ను ఆసుపత్రికి తీసుకెళ్లు" }, route: "/routing" },
  { action: "identify_snake", icon: Camera, label: { en: "Identify the snake", hi: "साँप पहचानो", te: "పామును గుర్తించు" }, route: "/snake" },
  { action: "sos", icon: Send, label: { en: "Call for help", hi: "मदद के लिए बुलाओ", te: "సహాయం కోసం పిలవండి" }, route: "/sos" },
  { action: "first_aid", icon: Activity, label: { en: "What first aid?", hi: "प्राथमिक उपचार?", te: "ప్రథమ చికిత్స?" }, route: "/first-aid" },
];

const UI = {
  en: {
    title: "Voice Assistant", sub: "Tap the mic and speak — I'll guide you and take you where you need to go.",
    idle: "Tap to speak", listening: "Listening… tap to stop", thinking: "Thinking…", speaking: "Speaking…",
    you: "You", bot: "Antidote+", opening: "Opening",
    hintTitle: "Or just tap what you need",
    noMic: "Voice input isn't available here. Tap a shortcut below instead.",
    micDenied: "Microphone permission is off. Enable it, or tap a shortcut below.",
    netErr: "Couldn't reach the assistant. Check your connection and try again.",
    sttErr: "I didn't catch that — tap the mic and try again.",
    greeting: "I'm your Antidote+ assistant. Tell me what happened, or say \"take me to a hospital\".",
  },
  hi: {
    title: "वॉइस असिस्टेंट", sub: "माइक दबाएँ और बोलें — मैं आपका मार्गदर्शन करूँगा और सही जगह ले जाऊँगा।",
    idle: "बोलने के लिए दबाएँ", listening: "सुन रहा हूँ… रोकने के लिए दबाएँ", thinking: "सोच रहा हूँ…", speaking: "बोल रहा हूँ…",
    you: "आप", bot: "Antidote+", opening: "खोल रहा हूँ",
    hintTitle: "या जो चाहिए उसे दबाएँ",
    noMic: "यहाँ वॉइस उपलब्ध नहीं है। नीचे शॉर्टकट दबाएँ।",
    micDenied: "माइक्रोफ़ोन बंद है। इसे चालू करें, या नीचे शॉर्टकट दबाएँ।",
    netErr: "असिस्टेंट तक नहीं पहुँच सका। कनेक्शन जाँचें और फिर कोशिश करें।",
    sttErr: "समझ नहीं पाया — माइक दबाकर फिर कोशिश करें।",
    greeting: "मैं आपका Antidote+ असिस्टेंट हूँ। बताइए क्या हुआ, या कहिए \"मुझे अस्पताल ले चलो\"।",
  },
  te: {
    title: "వాయిస్ అసిస్టెంట్", sub: "మైక్ నొక్కి మాట్లాడండి — నేను మార్గనిర్దేశం చేసి సరైన చోటుకు తీసుకెళ్తాను.",
    idle: "మాట్లాడటానికి నొక్కండి", listening: "వింటున్నాను… ఆపడానికి నొక్కండి", thinking: "ఆలోచిస్తున్నాను…", speaking: "మాట్లాడుతున్నాను…",
    you: "మీరు", bot: "Antidote+", opening: "తెరుస్తున్నాను",
    hintTitle: "లేదా మీకు కావాల్సింది నొక్కండి",
    noMic: "ఇక్కడ వాయిస్ అందుబాటులో లేదు. కింద షార్ట్‌కట్ నొక్కండి.",
    micDenied: "మైక్రోఫోన్ ఆఫ్‌లో ఉంది. దాన్ని ఆన్ చేయండి, లేదా కింద షార్ట్‌కట్ నొక్కండి.",
    netErr: "అసిస్టెంట్‌ను చేరలేకపోయాం. కనెక్షన్ చూసి మళ్లీ ప్రయత్నించండి.",
    sttErr: "నాకు అర్థం కాలేదు — మైక్ నొక్కి మళ్లీ ప్రయత్నించండి.",
    greeting: "నేను మీ Antidote+ అసిస్టెంట్. ఏం జరిగిందో చెప్పండి, లేదా \"నన్ను ఆసుపత్రికి తీసుకెళ్లు\" అనండి.",
  },
};

// Backend error code → localized message.
const ERR_KEY = { net: "netErr", mic: "micDenied", stt: "sttErr" };

export default function VoiceAssistant() {
  const navigate = useNavigate();
  const {
    language, status, error, messages, supported, toggle, busy,
  } = useVoiceAssistant();
  const lang = UI[language] ? language : "en";
  const t = UI[lang];

  const scrollRef = React.useRef(null);
  // Auto-scroll the transcript to the newest message.
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const handleMic = toggle;
  const errText = error ? t[ERR_KEY[error]] : "";
  const mic = MIC_STATES[status];

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: `linear-gradient(180deg, ${C.tealPale} 0%, #F7FAFA 40%)` }}
    >
      {/* Header */}
      <div
        className="px-4 pt-4 pb-4 flex items-center gap-3 shadow-sm"
        style={{
          background: `linear-gradient(135deg, ${C.teal} 0%, ${C.tealLight} 100%)`,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 22,
        }}
      >
        <BackButton tone="onTeal" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-white font-extrabold text-lg leading-tight">
            <Sparkles size={18} className="shrink-0" /> {t.title}
          </div>
          <div className="text-white/80 text-[12px] leading-snug">{t.sub}</div>
        </div>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <Bubble role="bot" botLabel={t.bot} text={t.greeting} />
        )}
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} botLabel={t.bot} youLabel={t.you} text={m.text} action={m.action} lang={lang} opening={t.opening} />
        ))}
        {busy && (
          <div className="ap-fade-up flex items-center gap-2">
            <div
              className="flex items-center gap-1.5 rounded-2xl px-3.5 py-3"
              style={{ background: "#fff", border: `1px solid ${C.tealPale}`, borderBottomLeftRadius: 4 }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="ap-bounce rounded-full"
                  style={{ width: 7, height: 7, background: C.tealLight, animationDelay: `${i * 0.16}s` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {errText && (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold"
             style={{ background: C.dangerPale, color: C.danger }}>
          <AlertCircle size={16} className="shrink-0 mt-0.5" /> {errText}
        </div>
      )}

      {/* Shortcuts */}
      <div className="px-4">
        <div className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: C.muted }}>
          {supported ? t.hintTitle : t.noMic}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SHORTCUTS.map(({ action, icon: Icon, label, route }, i) => (
            <button
              key={action}
              onClick={() => { stopAudio(); navigate(route); }}
              className="ap-fade-up flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-bold active:scale-95 transition-transform"
              style={{
                background: "#fff",
                color: C.dark,
                border: `1px solid ${C.tealPale}`,
                boxShadow: "0 2px 8px rgba(20,40,38,.05)",
                animationDelay: `${i * 0.05}s`,
              }}
            >
              <Icon size={16} style={{ color: C.teal }} className="shrink-0" />
              <span className="truncate">{label[lang]}</span>
              <ChevronRight size={14} style={{ color: C.muted }} className="ml-auto shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Mic control */}
      <div className="px-4 pt-4 pb-6 flex flex-col items-center gap-3 safe-bottom">
        <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
          {/* Ripple rings while recording */}
          {status === "recording" && [0, 0.6, 1.2].map((delay, i) => (
            <span
              key={i}
              className="ap-ring absolute inset-0 rounded-full"
              style={{ background: C.danger, animationDelay: `${delay}s` }}
            />
          ))}
          <button
            onClick={handleMic}
            disabled={!supported || busy}
            aria-label={t[status] || t.idle}
            className={`relative w-20 h-20 rounded-full flex items-center justify-center active:scale-95 transition-all disabled:opacity-60 ${
              status === "recording" || status === "speaking" ? "ap-breathe" : ""
            }`}
            style={{
              background: mic.bg,
              boxShadow:
                status === "recording"
                  ? `0 8px 28px ${C.danger}66`
                  : `0 8px 24px ${C.teal}55`,
            }}
          >
            {status === "recording" ? <Square size={28} color="#fff" fill="#fff" />
              : status === "processing" ? <Loader2 size={32} color="#fff" className="ap-spin" />
              : status === "speaking" ? <Volume2 size={30} color="#fff" />
              : <Mic size={32} color="#fff" />}
          </button>
        </div>
        <div className="flex items-center gap-2 text-[13px] font-bold" style={{ color: mic.text }}>
          {status === "speaking" && <Equalizer />}
          {t[status] || t.idle}
        </div>
      </div>
    </div>
  );
}

const MIC_STATES = {
  idle: { bg: C.teal, text: C.teal },
  recording: { bg: C.danger, text: C.danger },
  processing: { bg: C.tealLight, text: C.muted },
  speaking: { bg: C.tealLight, text: C.tealLight },
};

/** Small animated equaliser shown next to the "Speaking…" label. */
function Equalizer() {
  return (
    <span className="inline-flex items-end gap-0.5" style={{ height: 14 }} aria-hidden="true">
      {[0, 0.15, 0.3, 0.45].map((delay, i) => (
        <span
          key={i}
          className="ap-bar rounded-full"
          style={{ width: 3, height: 14, background: C.tealLight, animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  );
}

function Bubble({ role, text, action, botLabel, youLabel, lang = "en", opening }) {
  const isUser = role === "user";
  const meta = action && ACTION_META[action];
  return (
    <div className={`ap-fade-up flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: C.muted }}>
        {isUser ? youLabel : botLabel}
      </div>
      <div
        className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug"
        style={{
          background: isUser ? C.teal : "#fff",
          color: isUser ? "#fff" : C.dark,
          borderBottomRightRadius: isUser ? 4 : 16,
          borderBottomLeftRadius: isUser ? 16 : 4,
          border: isUser ? "none" : `1px solid ${C.tealPale}`,
          boxShadow: isUser ? `0 4px 14px ${C.teal}33` : "0 2px 8px rgba(20,40,38,.05)",
        }}
      >
        {text}
      </div>
      {meta && (
        <div className="ap-pop mt-1.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
             style={{ background: C.goodPale, color: C.good }}>
          <meta.icon size={13} />
          {opening} {meta.label[lang]}…
        </div>
      )}
    </div>
  );
}
