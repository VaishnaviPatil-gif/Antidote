import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity, Clock, Timer, CheckCircle2, Loader2, RefreshCw, AlertTriangle,
  TrendingUp, TrendingDown, Minus, FileText, X, WifiOff, Navigation, Sparkles,
  ChevronRight,
} from "lucide-react";
import { C, SEVERITY_TONE, SEVERITY_PALE } from "../theme.js";
import { tFor } from "../i18n.js";
import { useEmergency, minutesSinceBite } from "../context/EmergencyContext.jsx";
import { useOnline } from "../hooks/useOnline.js";
import { composeSummary, RANK } from "../lib/handover.js";
import { summarizeSymptoms, evaluateSeverity } from "../lib/api.js";

/**
 * Severity tracker (§2.5) — the medical core.
 *
 * A 15-minute monitoring loop the victim runs while travelling. Each round
 * asks the spec symptom checklist, computes a transparent severity level, and
 * appends a timestamped entry to symptomLog in EmergencyContext (which also
 * keeps `severity` in lockstep — the value routing READS). It surfaces the
 * trend versus the previous check and a plain-language handover summary for
 * the receiving hospital.
 *
 * Framed throughout as "monitoring to share with the hospital — not a
 * diagnosis." Clinical judgement always overrides this.
 */

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes between checks

/** Benign defaults — symptoms are absent unless the victim reports them. */
const DEFAULT_ANSWERS = {
  swelling: "local",
  breathing: "no",
  vision: "no",
  bleeding: "no",
  drowsy: "no",
};

/**
 * Transparent severity rule (no black box):
 *   any breathing / neuro (vision, drowsiness) / bleeding sign → severe
 *   else spreading swelling → moderate
 *   else → mild
 * @param {object} a - the checklist answers
 * @returns {"mild"|"moderate"|"severe"}
 */
function computeLevel(a) {
  const systemic =
    a.breathing === "yes" ||
    a.vision === "yes" ||
    a.bleeding === "yes" ||
    a.drowsy === "yes";
  if (systemic) return "severe";
  if (a.swelling === "spreading") return "moderate";
  return "mild";
}

export default function Tracker() {
  const { language, severity, symptomLog, appendSymptom, biteTime } = useEmergency();
  const t = tFor(language);
  const online = useOnline();
  const navigate = useNavigate();

  // Live clock (purely presentational — drives the countdown + summary stamp).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Form UI state (not shared — it's transient until a check is saved).
  const [formOpen, setFormOpen] = useState(false);
  const [answers, setAnswers] = useState(DEFAULT_ANSWERS);

  // Summary state machine: idle | loading | done | error. `source` is "gemini"
  // when the backend enhanced it, or "local" when composed on-device.
  const [summary, setSummary] = useState({ status: "idle", text: "", source: null });

  const hasLog = symptomLog.length > 0;
  const lastEntry = hasLog ? symptomLog[symptomLog.length - 1] : null;

  // The countdown is persisted as a TIMESTAMP, not a component timer: the next
  // check is the last entry's saved time + 15 min. Because symptomLog is stored
  // in localStorage (EmergencyContext), this survives refresh, app restart and
  // navigation — the 1s interval below only re-renders the remaining figure, it
  // is never the source of truth.
  const nextCheckAt = lastEntry
    ? new Date(lastEntry.t).getTime() + CHECK_INTERVAL_MS
    : null;
  const remainingSec =
    nextCheckAt != null ? Math.max(0, Math.floor((nextCheckAt - now.getTime()) / 1000)) : null;
  const due = remainingSec === 0;
  const cd =
    remainingSec != null
      ? `${Math.floor(remainingSec / 60)}:${String(remainingSec % 60).padStart(2, "0")}`
      : "15:00";

  // Trend vs the previous check.
  const trend = (() => {
    if (symptomLog.length < 2) return null;
    const d = RANK[lastEntry.level] - RANK[symptomLog[symptomLog.length - 2].level];
    return d > 0 ? "worsening" : d < 0 ? "improving" : "stable";
  })();

  // (Re)generate the handover summary whenever a new check is recorded.
  // Tries the backend (/api/summarize) when online; ALWAYS falls back to the
  // local composer, so the tracker never depends on the backend to function.
  const startSummary = useCallback(() => {
    if (!symptomLog.length) {
      setSummary({ status: "idle", text: "", source: null });
      return undefined;
    }
    setSummary((prev) => ({ ...prev, status: "loading" }));
    let cancelled = false;
    (async () => {
      const remote = online ? await summarizeSymptoms(symptomLog, biteTime, language) : null;
      try {
        const text = remote?.text || composeSummary(symptomLog, biteTime, new Date());
        const source = remote?.source || "local";
        if (!cancelled) setSummary({ status: "done", text, source });
      } catch {
        if (!cancelled) setSummary({ status: "error", text: "", source: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symptomLog, biteTime, online, language]);

  useEffect(() => {
    const cleanup = startSummary();
    return () => {
      if (typeof cleanup === "function") cleanup();
    };
    // Re-run only when a check is appended (length changes), not every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symptomLog.length]);

  const [evaluating, setEvaluating] = useState(false);

  const openCheck = useCallback(() => {
    setAnswers(DEFAULT_ANSWERS);
    setFormOpen(true);
  }, []);

  const saveCheck = async () => {
    setEvaluating(true);
    const mins = biteTime
      ? Math.max(0, Math.floor((Date.now() - new Date(biteTime).getTime()) / 60000))
      : 18;

    try {
      const res = await evaluateSeverity(answers, snake, mins, answers.swelling);
      if (res && res.severity) {
        appendSymptom({
          t: new Date(),
          answers: { ...answers },
          level: res.severity.toLowerCase(),
          aiSeverity: res
        });
      } else {
        throw new Error("Failed to evaluate severity");
      }
    } catch (err) {
      // Offline fallback
      const localLevel = computeLevel(answers);
      const fallbackResponse = {
        severity: localLevel.charAt(0).toUpperCase() + localLevel.slice(1),
        confidence: 0.85,
        reasoning: [
          "Analyzed using local rules engine (offline fallback).",
          answers.swelling === "spreading" ? "Spreading swelling up the limb." : "Local swelling only.",
          (answers.breathing === "yes" || answers.vision === "yes" || answers.bleeding === "yes" || answers.drowsy === "yes")
            ? "Systemic symptoms detected."
            : "Local symptoms only."
        ],
        disclaimer: "Never replace professional medical advice. Always remain safety-first.",
        source: "fallback"
      };
      appendSymptom({
        t: new Date(),
        answers: { ...answers },
        level: localLevel,
        aiSeverity: fallbackResponse
      });

      // Enqueue sync action
      const logIndex = symptomLog.length;
      import("../lib/sync.js").then(({ enqueueAction }) => {
        enqueueAction("EVALUATE_SEVERITY", {
          answers,
          snake,
          mins,
          swelling: answers.swelling,
          logIndex
        });
      });
    } finally {
      setEvaluating(false);
      setFormOpen(false);
    }
  };

  const setAns = (key, val) => setAnswers((a) => ({ ...a, [key]: val }));

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      {/* ── Title + framing ────────────────────────────────────── */}
      <div className="flex items-start gap-2">
        <Activity size={20} style={{ color: C.teal }} className="shrink-0 mt-0.5" />
        <div>
          <h1 className="text-lg font-extrabold leading-tight" style={{ color: C.dark }}>
            {t.tracker.title}
          </h1>
          <p className="text-xs leading-snug" style={{ color: C.muted }}>
            {t.tracker.subtitle}
          </p>
        </div>
      </div>

      {/* ── EMPTY STATE ────────────────────────────────────────── */}
      {!hasLog && !formOpen && (
        <div
          className="rounded-2xl bg-white border px-4 py-6 flex flex-col items-center text-center gap-3"
          style={{ borderColor: "#E1EAE9" }}
        >
          <div className="rounded-full p-3" style={{ background: C.tealPale }}>
            <Timer size={26} style={{ color: C.teal }} />
          </div>
          <p className="text-sm leading-snug" style={{ color: C.muted }}>
            {t.tracker.noLog}
          </p>
          <button
            onClick={openCheck}
            className="w-full rounded-xl text-white font-bold flex items-center justify-center gap-2 active:scale-[.98] transition-transform"
            style={{ background: C.teal, height: 52, fontSize: 16 }}
          >
            <Activity size={18} />
            {t.tracker.startMonitoring}
          </button>
        </div>
      )}

      {/* ── SEVERITY + TREND (success state) ───────────────────── */}
      {hasLog && (
        <div
          className="rounded-2xl border px-4 py-3"
          style={{ borderColor: SEVERITY_TONE[severity] + "44", background: SEVERITY_PALE[severity] }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold" style={{ color: C.muted }}>
                {t.severity}
              </div>
              <div className="text-2xl font-extrabold leading-tight" style={{ color: SEVERITY_TONE[severity] }}>
                {t[severity]}
              </div>
            </div>
            <div
              className="rounded-xl px-2.5 py-1.5 text-xs font-bold flex items-center gap-1.5"
              style={{ background: "#ffffffcc", color: SEVERITY_TONE[severity] }}
            >
              {t.tracker.round} {symptomLog.length}
            </div>
          </div>

          {/* Trend row */}
          <div className="flex items-center gap-1.5 mt-2 text-sm font-semibold">
            {trend === "worsening" && (
              <>
                <TrendingUp size={16} style={{ color: C.danger }} />
                <span style={{ color: C.danger }}>{t.tracker.worsening}</span>
              </>
            )}
            {trend === "improving" && (
              <>
                <TrendingDown size={16} style={{ color: C.good }} />
                <span style={{ color: C.good }}>{t.tracker.improving}</span>
              </>
            )}
            {trend === "stable" && (
              <>
                <Minus size={16} style={{ color: C.muted }} />
                <span style={{ color: C.muted }}>{t.tracker.stable}</span>
              </>
            )}
            {trend === null && (
              <span className="text-xs" style={{ color: C.muted }}>
                {t.tracker.firstCheck}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── AI Severity Analysis Card ──────────────────────────── */}
      {hasLog && lastEntry?.aiSeverity && (
        <div
          className="rounded-2xl bg-white border p-4 flex flex-col gap-3 shadow-sm"
          style={{ borderColor: "#E1EAE9" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold tracking-wider uppercase" style={{ color: C.teal }}>
              🧠 {t.tracker.aiTitle}
            </span>
            <span
              className="text-[10px] font-black rounded-full px-2 py-0.5 uppercase tracking-wide"
              style={{
                background: lastEntry.aiSeverity.source === "gemini" ? C.tealPale : "#F2F7F6",
                color: lastEntry.aiSeverity.source === "gemini" ? C.teal : C.muted
              }}
            >
              {lastEntry.aiSeverity.source === "gemini" ? "Gemini Live" : "Offline Rule"}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black" style={{ color: SEVERITY_TONE[lastEntry.aiSeverity.severity.toLowerCase()] || C.dark }}>
              {t[lastEntry.aiSeverity.severity.toLowerCase()] || lastEntry.aiSeverity.severity}
            </span>
            <span className="text-xs font-semibold" style={{ color: C.muted }}>
              ({t.tracker.aiConfidence}: {Math.round(lastEntry.aiSeverity.confidence * 100)}%)
            </span>
          </div>

          <div className="border-t pt-2.5 flex flex-col gap-1.5" style={{ borderColor: "#F2F7F6" }}>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
              {t.tracker.aiReasoning}
            </span>
            <ul className="list-disc pl-4 text-xs leading-snug space-y-1" style={{ color: C.dark }}>
              {lastEntry.aiSeverity.reasoning.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>

          <div
            className="rounded-xl p-2.5 text-[10px] font-medium leading-normal flex items-start gap-2 border"
            style={{ background: "#FDF3F2", borderColor: "#F0CFC9", color: C.danger }}
          >
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{lastEntry.aiSeverity.disclaimer}</span>
          </div>
        </div>
      )}

      {/* ── COUNTDOWN ──────────────────────────────────────────── */}
      {hasLog && !formOpen && (
        <div
          className="rounded-2xl bg-white border px-4 py-3 flex items-center gap-3"
          style={{ borderColor: due ? C.amber + "66" : "#E1EAE9" }}
        >
          <div
            className="rounded-xl p-2 shrink-0"
            style={{ background: due ? C.amberPale : C.tealPale }}
          >
            <Clock size={20} style={{ color: due ? C.amber : C.teal }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs" style={{ color: C.muted }}>
              {due ? t.tracker.due : t.tracker.nextCheck}
            </div>
            <div className="text-2xl font-extrabold tabular-nums leading-tight" style={{ color: C.dark }}>
              {due ? "0:00" : cd}
            </div>
          </div>
          <button
            onClick={openCheck}
            className="rounded-xl text-white font-bold px-4 shrink-0 active:scale-[.98] transition-transform"
            style={{ background: due ? C.amber : C.teal, height: 46, fontSize: 14 }}
          >
            {t.tracker.checkNow}
          </button>
        </div>
      )}

      {/* ── CHECKLIST FORM ─────────────────────────────────────── */}
      {formOpen && (
        <div className="rounded-2xl bg-white border overflow-hidden" style={{ borderColor: "#E1EAE9" }}>
          <div
            className="px-4 py-2.5 flex items-center justify-between text-white"
            style={{ background: C.teal }}
          >
            <span className="text-sm font-bold">
              {t.tracker.round} {symptomLog.length + 1}
            </span>
            <button
              onClick={() => setFormOpen(false)}
              aria-label={t.common.back}
              className="rounded-lg p-1"
              style={{ background: "rgba(255,255,255,.16)" }}
            >
              <X size={16} />
            </button>
          </div>

          <div className="px-4 py-3 flex flex-col gap-4">
            <Question label={t.tracker.q.swelling}>
              <Segmented
                value={answers.swelling}
                onChange={(v) => setAns("swelling", v)}
                options={[
                  { key: "none", label: t.tracker.q.swellingOpts.none, tone: C.good, pale: C.goodPale },
                  { key: "local", label: t.tracker.q.swellingOpts.local, tone: C.amber, pale: C.amberPale },
                  { key: "spreading", label: t.tracker.q.swellingOpts.spreading, tone: C.danger, pale: C.dangerPale },
                ]}
              />
            </Question>

            {[
              { key: "breathing", label: t.tracker.q.breathing },
              { key: "vision", label: t.tracker.q.vision },
              { key: "bleeding", label: t.tracker.q.bleeding },
              { key: "drowsy", label: t.tracker.q.drowsy },
            ].map((q) => (
              <Question key={q.key} label={q.label}>
                <Segmented
                  value={answers[q.key]}
                  onChange={(v) => setAns(q.key, v)}
                  options={[
                    { key: "no", label: t.tracker.q.no, tone: C.good, pale: C.goodPale },
                    { key: "yes", label: t.tracker.q.yes, tone: C.danger, pale: C.dangerPale },
                  ]}
                />
              </Question>
            ))}

            {/* Transparent rule — shown, not hidden. */}
            <div
              className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs leading-snug"
              style={{ background: C.tealPale, color: C.tealDark }}
            >
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{t.tracker.howDecided}</span>
            </div>

            <button
              onClick={saveCheck}
              disabled={evaluating}
              className="w-full rounded-xl text-white font-bold flex items-center justify-center gap-2 active:scale-[.98] transition-transform"
              style={{ background: C.teal, height: 52, fontSize: 16 }}
            >
              {evaluating ? (
                <>
                  <Loader2 size={18} className="ap-spin" />
                  {t.tracker.aiAnalyzing}
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  {t.tracker.submit}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── HANDOVER SUMMARY ───────────────────────────────────── */}
      {hasLog && (
        <section className="rounded-2xl bg-white border overflow-hidden" style={{ borderColor: "#E1EAE9" }}>
          <div className="px-4 pt-3 pb-2 flex items-start gap-2">
            <FileText size={17} style={{ color: C.teal }} className="shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold" style={{ color: C.dark }}>
                {t.tracker.summaryTitle}
              </div>
              <div className="text-xs" style={{ color: C.muted }}>
                {t.common.assistedNote}
              </div>
            </div>
            <button
              onClick={() => startSummary()}
              aria-label={t.tracker.regen}
              className="rounded-lg p-1.5 shrink-0"
              style={{ background: C.tealPale, color: C.teal }}
            >
              <RefreshCw size={15} />
            </button>
          </div>

          <div className="px-4 pb-3">
            {summary.status === "loading" && (
              <div className="flex items-center gap-2 py-2" style={{ color: C.muted }}>
                <span className="ap-spin inline-flex">
                  <Loader2 size={16} />
                </span>
                <span className="text-sm">{t.tracker.generating}</span>
              </div>
            )}

            {summary.status === "error" && (
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="text-sm" style={{ color: C.danger }}>
                  {t.common.noData}
                </span>
                <button
                  onClick={() => startSummary()}
                  className="text-sm font-semibold rounded-lg px-3 py-1.5"
                  style={{ background: C.tealPale, color: C.teal }}
                >
                  {t.common.retry}
                </button>
              </div>
            )}

            {summary.status === "done" && (
              <>
                <div
                  className="rounded-xl px-3 py-2.5 text-sm leading-snug"
                  style={{ background: "#F2F7F6", color: C.dark }}
                >
                  {summary.text}
                </div>
                {/* Architecture badge — makes the local-draft → Gemini split
                    explicit. The tracker never depends on Gemini to function. */}
                <div
                  className="flex items-start gap-1.5 mt-2 rounded-lg px-2.5 py-1.5 text-xs leading-snug"
                  style={{ background: C.tealPale, color: C.tealDark }}
                >
                  <Sparkles size={12} className="shrink-0 mt-0.5" />
                  <span>
                    {summary.source === "gemini" ? t.tracker.geminiBadge : t.tracker.draftBadge}
                  </span>
                </div>
                {!online && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs" style={{ color: C.amber }}>
                    <WifiOff size={12} />
                    {t.tracker.onDevice}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* ── MONITORING LOG ─────────────────────────────────────── */}
      {hasLog && (
        <section>
          <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: C.muted }}>
            {t.tracker.history}
          </div>
          <ul className="flex flex-col gap-2">
            {[...symptomLog].reverse().map((e, i) => {
              const idx = symptomLog.length - i;
              const time = new Date(e.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              // Elapsed time since the bite AT THE MOMENT of this check — the
              // number a clinician triages on, recorded per entry.
              const mins = minutesSinceBite(biteTime, new Date(e.t));
              return (
                <li
                  key={`${e.t}-${idx}`}
                  className="rounded-xl bg-white border px-3 py-2.5 flex items-center gap-3"
                  style={{ borderColor: "#E1EAE9" }}
                >
                  <div className="text-xs font-bold tabular-nums shrink-0" style={{ color: C.muted }}>
                    #{idx}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold" style={{ color: C.dark }}>
                      {t[e.level]}
                    </div>
                    <div className="text-xs tabular-nums" style={{ color: C.muted }}>
                      {mins != null ? `${mins} ${t.common.min} ${t.common.sinceBite} · ${time}` : time}
                    </div>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-bold shrink-0"
                    style={{ background: SEVERITY_PALE[e.level], color: SEVERITY_TONE[e.level] }}
                  >
                    {t[e.level]}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Main emergency action after monitoring ─────────────── */}
      {!formOpen && (
        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={() => navigate("/routing")}
            className="w-full rounded-xl text-white font-bold flex items-center justify-center gap-2 active:scale-[.98] transition-transform"
            style={{ background: C.orange, height: 54, fontSize: 16, boxShadow: "0 8px 24px rgba(232,106,23,.18)" }}
          >
            <Navigation size={18} fill="#fff" />
            {t.firstAid.findAsv}
            <ChevronRight size={18} />
          </button>
          <p className="text-xs text-center leading-snug" style={{ color: C.muted }}>
            {t.tracker.note}
          </p>
        </div>
      )}
    </div>
  );
}

/** A labelled question block. */
function Question({ label, children }) {
  return (
    <div>
      <div className="text-sm font-semibold mb-2" style={{ color: C.dark }}>
        {label}
      </div>
      {children}
    </div>
  );
}

/**
 * Segmented option control styled like the routing screen's severity selector.
 * @param {{ value:string, onChange:(k:string)=>void, options:Array }} props
 */
function Segmented({ value, onChange, options }) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}
    >
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className="rounded-xl border px-2 py-2 text-sm font-semibold transition-all leading-tight"
            style={{
              borderColor: active ? o.tone : "#D7E3E2",
              borderWidth: active ? 2 : 1,
              background: active ? o.pale : "#fff",
              color: active ? o.tone : C.dark,
              minHeight: 44,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
