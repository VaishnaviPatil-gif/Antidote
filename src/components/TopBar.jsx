import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Siren, RotateCcw, Check, X } from "lucide-react";
import { C } from "../theme.js";
import { LANGS, LANG_LABEL, tFor } from "../i18n.js";
import { useEmergency } from "../context/EmergencyContext.jsx";

/**
 * Shared top bar — visually identical to the routing screen's header:
 * teal background, Siren badge, "Antidote+" wordmark + trilingual tagline,
 * and the తె/हि/EN language pill that drives the global language in context.
 *
 * Rendered once by <Shell> so every non-routing screen shares it. The routing
 * hero keeps its own matching header (it is self-contained per §4).
 *
 * Once an emergency is in progress (biteTime set) it also offers a "Start over"
 * reset — a two-tap confirm that clears the persisted emergency and returns
 * Home, so a new victim / repeat demo never inherits the previous bite's state.
 */
export default function TopBar() {
  const { language, setLanguage, biteTime, resetEmergency } = useEmergency();
  const t = tFor(language);
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  const doReset = () => {
    resetEmergency();
    setConfirming(false);
    navigate("/");
  };

  return (
    <header
      style={{ background: C.teal, paddingTop: "calc(16px + env(safe-area-inset-top, 0px))" }}
      className="px-4 pb-3 text-white"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center rounded-xl"
            style={{ background: "rgba(255,255,255,.14)", width: 36, height: 36 }}
          >
            <Siren size={20} strokeWidth={2.4} />
          </div>
          <div className="leading-tight">
            <div className="font-bold text-lg tracking-tight">Antidote+</div>
            <div style={{ color: "#BFE3E1" }} className="text-xs">
              {t.tag}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {biteTime && !confirming && (
            <button
              onClick={() => setConfirming(true)}
              aria-label={t.common.startOver}
              className="flex items-center gap-1 rounded-full text-xs font-semibold transition-colors"
              style={{
                height: 30,
                padding: "0 10px",
                background: "rgba(255,255,255,.12)",
                color: "#DCEFEE",
              }}
            >
              <RotateCcw size={13} />
              {t.common.startOver}
            </button>
          )}

          <button
            onClick={() => navigate("/demo")}
            aria-label="Demo Mode"
            className="flex items-center justify-center rounded-full transition-colors active:scale-95"
            style={{
              width: 34,
              height: 34,
              background: "rgba(255,255,255,.12)",
              color: "#DCEFEE",
            }}
          >
            🧪
          </button>

          <div
            className="flex items-center gap-1 rounded-full p-0.5"
            style={{ background: "rgba(255,255,255,.12)" }}
            role="group"
            aria-label="Language"
          >
            {LANGS.map((l) => {
            const active = language === l;
            return (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                aria-label={`Switch language to ${l === "te" ? "Telugu" : l === "hi" ? "Hindi" : "English"}`}
                aria-pressed={active}
                className="rounded-full text-xs font-semibold transition-colors"
                style={{
                  minWidth: 34,
                  height: 30,
                  padding: "0 8px",
                  background: active ? "#fff" : "transparent",
                  color: active ? C.teal : "#DCEFEE",
                }}
              >
                {LANG_LABEL[l]}
              </button>
            );
            })}
          </div>
        </div>
      </div>

      {/* Two-tap confirm — guards against an accidental reset mid-emergency. */}
      {confirming && (
        <div
          className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: "rgba(255,255,255,.14)" }}
          role="alertdialog"
          aria-label={t.common.startOverConfirm}
        >
          <span className="text-sm font-semibold flex-1 leading-snug">
            {t.common.startOverConfirm}
          </span>
          <button
            onClick={doReset}
            className="flex items-center gap-1 rounded-lg text-xs font-bold px-2.5 py-1.5"
            style={{ background: "#fff", color: C.danger }}
          >
            <Check size={13} />
            {t.common.startOverYes}
          </button>
          <button
            onClick={() => setConfirming(false)}
            aria-label={t.common.back}
            className="flex items-center justify-center rounded-lg px-2 py-1.5"
            style={{ background: "rgba(255,255,255,.18)", color: "#fff" }}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </header>
  );
}
