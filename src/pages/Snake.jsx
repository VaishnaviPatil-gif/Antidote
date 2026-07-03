import React, { useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera, Loader2, AlertTriangle, ShieldAlert, X, RefreshCw,
  ChevronRight, SkipForward, Info,
} from "lucide-react";
import { C, FRAME_BG } from "../theme.js";



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
  const { language, snake, snakeImage, setSnake, setSnakeImage } = useEmergency();
  const t = tFor(language);
  const fileRef = useRef(null);

  // All UI state — the image preview can rehydrate from context
  const [status, setStatus] = useState(() => (snake ? "result" : "idle")); // idle | analyzing | result
  const [preview, setPreview] = useState(() => snakeImage);
  const [result, setResult] = useState(() => snake);
  const [failed, setFailed] = useState(() => !!(snake && snake.validation_status?.includes("Fallback")));

  const onFile = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // allow re-selecting the same file
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result;
        setPreview(dataUrl);
        setSnakeImage(dataUrl);
        setStatus("analyzing");
        
        const r = await identifySnake(dataUrl);
        const { _failed, ...snakeData } = r;
        
        setSnake(snakeData);
        setResult(snakeData);
        setFailed(_failed);
        setStatus("result");

        if (_failed) {
          // If offline or request failed, queue for background sync when internet returns
          import("../lib/sync.js").then(({ enqueueAction }) => {
            enqueueAction("IDENTIFY_SNAKE", { imageB64: dataUrl });
          });
        }
      };
      reader.readAsDataURL(file);
    },
    [setSnake, setSnakeImage]
  );

  const clearPhoto = useCallback(() => {
    setPreview(null);
    setResult(null);
    setFailed(false);
    setStatus("idle");
    setSnake(null);
    setSnakeImage(null);
  }, [setSnake, setSnakeImage]);

  const isConfident =
    result && result.confidence >= LOW_CONFIDENCE && result.species !== "Unidentified";

  // Fallback framing — derived ONLY from the existing API response
  const fbConfidencePct = Math.round((result?.confidence || 0) * 100);
  const fbReason = failed
    ? t.snake.fallback.reasons.failed
    : result?.confidence > 0
    ? t.snake.fallback.reasons.lowConfidence
    : t.snake.fallback.reasons.unverified;

  // Compute herpetological report details directly from API result
  const reportCommonName = result?.common_name || t.snake.unidentified;
  const reportScientificName = result?.scientific_name;
  const reportReasoning = Array.isArray(result?.reasoning)
    ? result.reasoning
    : [t.snake.fallback.reasons.unverified];

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

      {/* ── RESULT (Unified Medical Report Card) ────────────────── */}
      {status === "result" && result && (
        <div 
          className="rounded-2xl border bg-white p-4 flex flex-col gap-4 shadow-sm"
          style={{ borderColor: "#C5DBD9" }}
        >
          {/* Report Header */}
          <div className="flex items-center gap-2 pb-3 border-b" style={{ borderColor: "#E1EAE9" }}>
            <div className="rounded-lg p-2 shrink-0" style={{ background: C.tealPale }}>
              <Camera size={20} style={{ color: C.teal }} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: C.teal }}>
                {t.snake.reportTitle}
              </div>
              <div className="text-[10px] leading-tight" style={{ color: C.muted }}>
                {t.snake.metadataTitle} • {new Date().toLocaleDateString(language === "en" ? "en-US" : language === "hi" ? "hi-IN" : "te-IN")}
              </div>
            </div>
          </div>

          {/* Card 1: Species Summary */}
          <div className="rounded-xl border p-3.5 flex flex-col gap-3.5" style={{ borderColor: "#E1EAE9", background: FRAME_BG }}>
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                  {t.snake.commonName}
                </div>
                <div className="text-base font-extrabold leading-tight break-words" style={{ color: C.dark }}>
                  {reportCommonName}
                </div>
              </div>
              
              {/* Venomous / Non-Venomous Badge */}
              <span
                className="text-[10px] font-extrabold rounded-full px-2.5 py-1 flex items-center gap-1 shrink-0 shadow-sm"
                style={{
                  background: result.venomous ? C.dangerPale : C.goodPale,
                  color: result.venomous ? C.danger : C.good,
                  border: `1px solid ${result.venomous ? "#F0CFC9" : "#CBE7DB"}`
                }}
              >
                <AlertTriangle size={10} />
                {result.venomous ? t.snake.venomousBadge : t.snake.nonVenomousBadge}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t pt-3" style={{ borderColor: "#F2F7F6" }}>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                  {t.snake.scientificName}
                </div>
                <div className="text-xs font-semibold italic truncate" style={{ color: C.tealDark }}>
                  {reportScientificName || "N/A"}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                  {t.snake.dangerLevel}
                </div>
                <div className="text-xs font-black truncate" style={{ color: result.danger_level?.toLowerCase()?.includes("harmless") ? C.good : C.danger }}>
                  {result.danger_level || "Critical"}
                </div>
              </div>

              <div className="col-span-2">
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                  {t.snake.venomType}
                </div>
                <div className="text-xs font-bold" style={{ color: C.dark }}>
                  {result.venom_type || "N/A"}
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Diagnostics & Confidence */}
          <div className="rounded-xl border p-3.5 flex flex-col gap-3" style={{ borderColor: "#E1EAE9" }}>
            {/* Confidence Progress Bar */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: C.muted }}>
                <span className="font-bold">{t.snake.confidence}</span>
                <span className="font-extrabold tabular-nums" style={{ color: isConfident ? C.teal : C.danger }}>
                  {fbConfidencePct}%
                </span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "#E8F0EF" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ 
                    width: `${fbConfidencePct}%`, 
                    background: isConfident ? C.teal : C.danger 
                  }}
                />
              </div>
              {!isConfident && (
                <div className="text-[10px] mt-1 font-medium" style={{ color: C.danger }}>
                  * {t.snake.fallback.belowThreshold}
                </div>
              )}
            </div>

            {/* Validation Status */}
            <div className="pt-2.5 border-t" style={{ borderColor: "#E1EAE9" }}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: C.muted }}>
                {t.snake.validationStatus}
              </div>
              <div 
                className="text-xs font-bold rounded-lg p-2 flex items-center gap-2"
                style={{
                  background: isConfident ? C.goodPale : C.dangerPale,
                  color: isConfident ? C.good : C.danger,
                  border: `1px solid ${isConfident ? "#CBE7DB" : "#F0CFC9"}`
                }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: isConfident ? C.good : C.danger }} />
                <span className="leading-tight">
                  {isConfident ? t.snake.validated : t.snake.fallbackActive}
                </span>
              </div>
            </div>

            {/* Diagnostic Observations */}
            <div className="pt-2.5 border-t" style={{ borderColor: "#E1EAE9" }}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: C.muted }}>
                {t.snake.observations}
              </div>
              <ul className="flex flex-col gap-1.5 list-none pl-0 m-0">
                {reportReasoning.map((item, idx) => (
                  <li key={idx} className="text-xs leading-snug flex items-start gap-2" style={{ color: C.dark }}>
                    <span className="text-[14px] leading-none shrink-0" style={{ color: isConfident ? C.teal : C.danger }}>•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Card 3: Herpetological Details */}
          {(result.typical_habitat || (result.similar_snakes && result.similar_snakes.length > 0)) && (
            <div className="rounded-xl border p-3.5 flex flex-col gap-3 bg-white" style={{ borderColor: "#E1EAE9" }}>
              {result.typical_habitat && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                    {t.snake.typicalHabitat}
                  </div>
                  <div className="text-xs leading-normal mt-0.5" style={{ color: C.dark }}>
                    {result.typical_habitat}
                  </div>
                </div>
              )}

              {result.similar_snakes && result.similar_snakes.length > 0 && (
                <div className="border-t pt-3" style={{ borderColor: "#F2F7F6" }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                    {t.snake.similarSnakes}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {result.similar_snakes.map((s, idx) => (
                      <span
                        key={idx}
                        className="rounded-lg px-2 py-0.5 text-[10px] font-semibold border"
                        style={{ background: "#F2F7F6", borderColor: "#E1EAE9", color: C.tealDark }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Card 4: First Aid Recommendations */}
          <div className="rounded-xl border p-3.5 flex flex-col gap-3 bg-white" style={{ borderColor: "#E1EAE9" }}>
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: C.dark }}>
              {t.snake.firstAidTitle}
            </div>
            <ol className="flex flex-col gap-2 pl-0 m-0 list-none">
              {(result.first_aid_steps && result.first_aid_steps.length > 0
                ? result.first_aid_steps
                : t.snake.fallback.steps
              ).map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-xs leading-snug" style={{ color: C.dark }}>
                  <span
                    className="flex items-center justify-center rounded-full shrink-0 font-bold text-white text-[10px]"
                    style={{ width: 16, height: 16, background: isConfident ? C.teal : C.danger }}
                  >
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Card 5: Medical Protocol & Disclaimer */}
          <div 
            className="rounded-xl p-3.5 flex flex-col gap-1.5 border" 
            style={{ 
              background: C.tealPale, 
              borderColor: "#C5DBD9",
              color: C.tealDark 
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Info size={12} style={{ color: C.teal }} />
              {t.snake.disclaimerTitle}
            </div>
            <div className="text-[11px] leading-relaxed" style={{ color: C.muted }}>
              {t.snake.disclaimerBody}
            </div>
          </div>
        </div>
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
