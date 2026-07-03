import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Hospital as HospitalIcon, Timer, Clock, Activity, FileText,
  ClipboardCheck, ChevronLeft, Building2,
} from "lucide-react";
import { C, SEVERITY_TONE, SEVERITY_PALE } from "../theme.js";
import { tFor } from "../i18n.js";
import { useEmergency, minutesSinceBite } from "../context/EmergencyContext.jsx";
import { composeSummary, requiredVialsFor, DEMO_RECOMMENDED } from "../lib/handover.js";

/**
 * Hospital incoming-patient view (§2.8) — ONE simulated, read-only screen.
 *
 * No login, no backend, no patient management. It mirrors the exact handoff the
 * SOS already sends — the same emergency seen from the hospital's side — built
 * entirely from EmergencyContext. Its only job is to make a judge think "this
 * helps hospitals too." Reached via the SOS confirmation's "View as hospital".
 */
export default function Hospital() {
  const navigate = useNavigate();
  const { language, biteTime, severity, symptomLog, recommendedHospital } = useEmergency();
  const t = tFor(language);

  // Live time-since-bite — clinicians triage heavily on this number.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const mins = minutesSinceBite(biteTime, now);

  // Recommended facility + ETA come from routing (Step 10); demo fallback here.
  const hospital = recommendedHospital || DEMO_RECOMMENDED;

  const summary = useMemo(
    () => (symptomLog.length ? composeSummary(symptomLog, biteTime, new Date()) : ""),
    [symptomLog, biteTime]
  );

  const prepVials = requiredVialsFor(severity);
  const sevTone = SEVERITY_TONE[severity];

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      {/* ── Title + read-only framing ──────────────────────────── */}
      <div className="flex items-start gap-2">
        <HospitalIcon size={20} style={{ color: C.teal }} className="shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-extrabold leading-tight" style={{ color: C.dark }}>
            {t.hospital.title}
          </h1>
          <p className="text-xs leading-snug" style={{ color: C.muted }}>
            {t.hospital.subtitle}
          </p>
        </div>
      </div>

      {/* ── Dashboard link banner ── */}
      <button
        onClick={() => navigate("/dashboard")}
        className="w-full rounded-xl border flex items-center justify-between px-3 py-2.5 text-xs font-bold active:scale-[.99] transition-transform"
        style={{ borderColor: "#C5DBD9", color: C.teal, background: C.tealPale }}
      >
        <span className="flex items-center gap-1.5">
          <Activity size={14} style={{ color: C.teal }} />
          {t.dashboard.title}
        </span>
        <ChevronRight size={14} style={{ color: C.teal }} />
      </button>

      {/* ── Incoming alert card ────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: `2px solid ${sevTone}`, boxShadow: `0 8px 24px ${sevTone}22` }}
      >
        <div
          className="px-4 py-2 flex items-center gap-2 text-white"
          style={{ background: sevTone }}
        >
          <Activity size={16} />
          <span className="text-sm font-bold uppercase tracking-wide">{t.hospital.incoming}</span>
          <span
            className="ml-auto text-xs font-bold rounded px-1.5 py-0.5"
            style={{ background: "rgba(255,255,255,.22)" }}
          >
            {t[severity]}
          </span>
        </div>

        <div className="bg-white px-4 pt-3 pb-4">
          {/* Big stats: ETA · time since bite · severity */}
          <div className="grid grid-cols-3 gap-2">
            <Stat icon={<Timer size={15} />} value={`${hospital.eta}`} unit={t.common.min} label={t.hospital.eta} tone={C.teal} />
            <Stat icon={<Clock size={15} />} value={mins != null ? `${mins}` : "—"} unit={t.common.min} label={t.hospital.timeSince} tone={C.orange} />
            <Stat icon={<Activity size={15} />} value={t[severity]} label={t.hospital.severityLabel} tone={sevTone} small />
          </div>

          {/* Facility */}
          <div className="flex items-center gap-2 mt-3 rounded-xl px-3 py-2" style={{ background: "#F2F7F6" }}>
            <Building2 size={16} style={{ color: C.teal }} className="shrink-0" />
            <div className="min-w-0">
              <div className="text-xs" style={{ color: C.muted }}>
                {t.hospital.facility}
              </div>
              <div className="text-sm font-bold truncate" style={{ color: C.dark }}>
                {hospital.name}
              </div>
            </div>
            {hospital.icu && (
              <span
                className="ml-auto text-xs font-bold rounded px-1.5 py-0.5 shrink-0"
                style={{ background: C.tealPale, color: C.teal }}
              >
                {t.icu}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Symptom summary ────────────────────────────────────── */}
      <section className="rounded-2xl bg-white border overflow-hidden" style={{ borderColor: "#E1EAE9" }}>
        <div className="px-4 pt-3 pb-1 flex items-center gap-2">
          <FileText size={16} style={{ color: C.teal }} />
          <span className="text-sm font-bold" style={{ color: C.dark }}>
            {t.hospital.summary}
          </span>
        </div>
        <div className="px-4 pb-3">
          {summary ? (
            <div className="rounded-xl px-3 py-2.5 text-sm leading-snug" style={{ background: "#F2F7F6", color: C.dark }}>
              {summary}
            </div>
          ) : (
            <div className="text-sm" style={{ color: C.muted }}>
              {t.common.noData}
            </div>
          )}
        </div>
      </section>

      {/* ── Prepare (derived from severity + facility ICU) ─────── */}
      <section
        className="rounded-2xl px-4 py-3 flex items-start gap-3"
        style={{ background: SEVERITY_PALE[severity] }}
      >
        <div className="rounded-lg p-2 shrink-0" style={{ background: "#ffffffcc" }}>
          <ClipboardCheck size={18} style={{ color: sevTone }} />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wide" style={{ color: sevTone }}>
            {t.hospital.prepare}
          </div>
          <div className="text-sm font-semibold leading-snug mt-0.5" style={{ color: C.dark }}>
            {t.hospital.prepareLine(prepVials, hospital.icu)}
          </div>
        </div>
      </section>

      {/* ── Back ───────────────────────────────────────────────── */}
      <button
        onClick={() => navigate("/sos")}
        className="w-full rounded-xl border font-semibold flex items-center justify-center gap-2 active:scale-[.98] transition-transform"
        style={{ borderColor: C.teal, color: C.teal, height: 50, fontSize: 15, background: "#fff" }}
      >
        <ChevronLeft size={16} />
        {t.hospital.backToSos}
      </button>
    </div>
  );
}

/** Big-number stat block, identical idiom to the routing screen's stats. */
function Stat({ icon, value, unit, label, tone, small }) {
  return (
    <div className="rounded-xl px-2 py-2 text-center" style={{ background: "#F2F7F6" }}>
      <div className="flex items-center justify-center gap-1" style={{ color: tone }}>
        {icon}
        <span className={`font-extrabold tabular-nums ${small ? "text-sm" : "text-lg"} leading-tight`}>
          {value}
          {unit && <span className="text-xs font-semibold ml-0.5">{unit}</span>}
        </span>
      </div>
      <div className="text-[11px] mt-0.5 leading-tight" style={{ color: "#6E8A88" }}>
        {label}
      </div>
    </div>
  );
}
