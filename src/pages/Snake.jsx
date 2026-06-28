import React, { useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera, Loader2, AlertTriangle, ShieldAlert, X, RefreshCw,
  ChevronRight, SkipForward, Info,
} from "lucide-react";
import { C } from "../theme.js";
import { tFor } from "../i18n.js";
import { useEmergency } from "../context/EmergencyContext.jsx";
import { identifySnake } from "../lib/api.js";

/**
 * Snake capture (§2.3) — OPTIONAL, never blocks the emergency flow.
 *
 * Framed as "AI-assisted image analysis, not a diagnosis." The hero of the app
 * is emergency response, not species ID, so this screen always offers Skip and
 * always falls back to the safe default: assume venomous. The /api/identify
 * call (and its safe fallback) lives in src/lib/api.js.
 *
 * Writes ONLY the `snake` slice of EmergencyContext.
 */

/** Below this the model is "unsure" — we refuse to name a species. */
const LOW_CONFIDENCE = 0.6;

export default function Snake() {
  const navigate = useNavigate();
  const { language, setSnake } = useEmergency();
  const t = tFor(language);
  const fileRef = useRef(null);

  // All UI state — the image preview never enters context (keeps state light).
  const [status, setStatus] = useState("idle"); // idle | analyzing | result
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState(false);

  const onFile = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // allow re-selecting the same file
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result;
        setPreview(dataUrl);
        setStatus("analyzing");
        const r = await identifySnake(dataUrl);
        const { _failed, ...snake } = r;
        setSnake(snake); // write ONLY the snake slice
        setResult(snake);
        setFailed(_failed);
        setStatus("result");
      };
      reader.readAsDataURL(file);
    },
    [setSnake]
  );

  const clearPhoto = useCallback(() => {
    setPreview(null);
    setResult(null);
    setFailed(false);
    setStatus("idle");
    setSnake(null);
  }, [setSnake]);

  const isConfident =
    result && result.confidence >= LOW_CONFIDENCE && result.species !== "Unidentified";

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      {/* Hidden capture input — camera on mobile, gallery on desktop. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* ── Title + framing ────────────────────────────────────── */}
      <div className="flex items-start gap-2">
        <Camera size={20} style={{ color: C.teal }} className="shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold leading-tight" style={{ color: C.dark }}>
            {t.snake.title}
          </h1>
          <p className="text-xs leading-snug" style={{ color: C.muted }}>
            {t.snake.subtitle}
          </p>
        </div>
      </div>

      {/* ── Capture / preview ──────────────────────────────────── */}
      {status === "idle" && (
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 py-8 active:scale-[.99] transition-transform"
          style={{ borderColor: "#C5DBD9", background: "#fff" }}
        >
          <span className="rounded-full p-3" style={{ background: C.tealPale }}>
            <Camera size={26} style={{ color: C.teal }} />
          </span>
          <span className="text-sm font-bold" style={{ color: C.teal }}>
            {t.snake.take}
          </span>
        </button>
      )}

      {(status === "analyzing" || status === "result") && preview && (
        <div className="rounded-2xl overflow-hidden border relative" style={{ borderColor: "#E1EAE9" }}>
          <img
            src={preview}
            alt={t.snake.title}
            className="w-full object-cover"
            style={{ maxHeight: 200 }}
          />
          {status === "result" && (
            <button
              onClick={clearPhoto}
              aria-label={t.snake.retake}
              className="absolute top-2 right-2 rounded-full p-1.5"
              style={{ background: "rgba(20,40,38,.6)", color: "#fff" }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* ── ANALYZING (loading) ────────────────────────────────── */}
      {status === "analyzing" && (
        <div
          className="rounded-2xl bg-white border px-4 py-4 flex items-center gap-3"
          style={{ borderColor: "#E1EAE9" }}
        >
          <span className="ap-spin inline-flex" style={{ color: C.teal }}>
            <Loader2 size={20} />
          </span>
          <span className="text-sm font-semibold" style={{ color: C.dark }}>
            {t.snake.analyzing}
          </span>
        </div>
      )}

      {/* ── RESULT ─────────────────────────────────────────────── */}
      {status === "result" && result && (
        <>
          {isConfident ? (
            /* Confident-enough guess — still clearly "not a diagnosis". */
            <div className="rounded-2xl bg-white border overflow-hidden" style={{ borderColor: "#E1EAE9" }}>
              <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.muted }}>
                  {t.snake.guess}
                </div>
                <span
                  className="text-xs font-bold rounded-full px-2 py-0.5 flex items-center gap-1"
                  style={{
                    background: result.venomous ? C.dangerPale : C.goodPale,
                    color: result.venomous ? C.danger : C.good,
                  }}
                >
                  <AlertTriangle size={11} />
                  {result.venomous ? t.snake.venomous : "—"}
                </span>
              </div>
              <div className="px-4 pb-3">
                <div className="text-xl font-extrabold leading-tight" style={{ color: C.dark }}>
                  {result.species}
                </div>

                {/* Confidence bar */}
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs mb-1" style={{ color: C.muted }}>
                    <span>{t.snake.confidence}</span>
                    <span className="font-bold tabular-nums">
                      {Math.round(result.confidence * 100)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "#E8F0EF" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.round(result.confidence * 100)}%`, background: C.teal }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: C.muted }}>
                  <Info size={12} />
                  {t.common.assistedNote}
                </div>
              </div>
            </div>
          ) : (
            /* Low confidence / unidentified / failure → assume venomous. */
            <div
              className="rounded-2xl border px-4 py-3"
              style={{ borderColor: "#F0CFC9", background: C.dangerPale }}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg p-1.5 shrink-0" style={{ background: "#F6D9D4" }}>
                  <ShieldAlert size={18} style={{ color: C.danger }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-bold" style={{ color: C.danger }}>
                    {t.snake.assumeVenom}
                  </div>
                  <div className="text-xs leading-snug mt-1" style={{ color: C.dark }}>
                    {t.snake.assumeVenomBody}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold" style={{ color: C.danger }}>
                    <Info size={12} />
                    {failed ? t.snake.analyzeFailed : t.snake.lowConfidence}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Don't chase the snake (reused routing strings) ─────── */}
      <div className="rounded-2xl px-4 py-3 flex items-start gap-3" style={{ background: C.tealPale }}>
        <AlertTriangle size={18} style={{ color: C.teal }} className="shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-bold" style={{ color: C.tealDark }}>
            {t.dontChase}
          </div>
          <div className="text-xs leading-snug mt-0.5" style={{ color: C.muted }}>
            {t.dontChaseBody}
          </div>
        </div>
      </div>

      {/* Safety-first note. */}
      <p className="text-xs leading-snug" style={{ color: C.muted }}>
        {t.snake.safetyFirst}
      </p>

      {/* ── CTAs — photo never blocks the flow ─────────────────── */}
      <div className="flex flex-col gap-2 pt-1">
        <button
          onClick={() => navigate("/tracker")}
          className="w-full rounded-xl text-white font-bold flex items-center justify-center gap-2 active:scale-[.98] transition-transform"
          style={{ background: C.teal, height: 54, fontSize: 16 }}
        >
          {t.snake.continueTracker}
          <ChevronRight size={18} />
        </button>

        {status === "result" ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-xl border font-semibold flex items-center justify-center gap-2 active:scale-[.98] transition-transform"
            style={{ borderColor: C.teal, color: C.teal, height: 50, fontSize: 15, background: "#fff" }}
          >
            <RefreshCw size={16} />
            {t.snake.retake}
          </button>
        ) : (
          <button
            onClick={() => navigate("/tracker")}
            className="w-full rounded-xl border font-semibold flex items-center justify-center gap-2 active:scale-[.98] transition-transform"
            style={{ borderColor: "#D7E3E2", color: C.muted, height: 50, fontSize: 15, background: "#fff" }}
          >
            <SkipForward size={16} />
            {t.snake.skip}
          </button>
        )}
      </div>
    </div>
  );
}
