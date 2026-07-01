import React, { useCallback, useRef, useState } from "react";
import {
  Stethoscope, Clock, Timer, MapPin, Building2, Activity, ShieldAlert,
  Droplets, HeartPulse, ClipboardList, User, Languages, RadioTower,
  Copy, Share2, Check, ChevronDown, WifiOff,
} from "lucide-react";
import { C } from "../theme.js";
import { tFor } from "../i18n.js";
import { useEmergency } from "../context/EmergencyContext.jsx";
import { useHandoverModel } from "../lib/clinicalHandover.js";
import { copyToClipboard, shareOrCopy } from "../lib/share.js";

/**
 * ClinicianHandover — the auto-generated emergency triage handover card.
 *
 * Presentational only: it calls useHandoverModel() for the fully-derived model
 * (all logic lives in lib/clinicalHandover.js) and renders a real ED-style
 * handover that a doctor can read in ~5 seconds. It reads EmergencyContext for
 * the optional patient editor's current values + setter — the only state it
 * writes — and offers Copy / Share (Android-safe, no PDF/print).
 *
 * Designed to be complete in a single screenshot: self-contained header with
 * brand + severity + last-updated timestamp.
 *
 * Props:
 *   hospital — optional richer facility (e.g. routing's live `recommended`);
 *              falls back to the hospital in context.
 *   status   — "confirmed" | "enroute" | "pending" (drives the status line).
 */
export default function ClinicianHandover({ hospital, status }) {
  const { language, patientId, patientAge, patientGender, setPatientInfo } = useEmergency();
  const t = tFor(language);
  const h = t.handover;
  const model = useHandoverModel({ hospital, status });

  // ── Copy / Share (transient "Copied" flash) ──────────────────────────────
  const [flash, setFlash] = useState(null); // null | "copied" | "shared"
  const flashRef = useRef(null);
  const showFlash = useCallback((kind) => {
    setFlash(kind);
    clearTimeout(flashRef.current);
    flashRef.current = setTimeout(() => setFlash(null), 1800);
  }, []);

  const onCopy = useCallback(async () => {
    if (await copyToClipboard(model.text)) showFlash("copied");
  }, [model.text, showFlash]);

  const onShare = useCallback(async () => {
    const res = await shareOrCopy({ title: h.shareTitle, text: model.text });
    if (res === "shared") showFlash("shared");
    else if (res === "copied") showFlash("copied");
  }, [model.text, h.shareTitle, showFlash]);

  // ── Optional patient editor (Option A: fields live in context) ───────────
  const [editing, setEditing] = useState(false);
  const [pId, setPId] = useState(patientId || "");
  const [pAge, setPAge] = useState(patientAge != null ? `${patientAge}` : "");
  const [pGender, setPGender] = useState(patientGender || "");
  const savePatient = useCallback(() => {
    setPatientInfo({
      patientId: pId.trim() || null,
      patientAge: pAge.trim() || null,
      patientGender: pGender || null,
    });
    setEditing(false);
  }, [pId, pAge, pGender, setPatientInfo]);

  const tone = model.severityTone;

  return (
    <div
      className="rounded-2xl overflow-hidden bg-white"
      style={{ border: `2px solid ${tone}`, boxShadow: `0 10px 28px ${tone}22` }}
    >
      {/* ── Header (brand + severity + timestamp) ─────────────────────────── */}
      <div className="px-4 pt-3 pb-3 text-white" style={{ background: tone }}>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center rounded-lg shrink-0"
            style={{ background: "rgba(255,255,255,.2)", width: 30, height: 30 }}
          >
            <Stethoscope size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-extrabold uppercase tracking-wide leading-tight">
              {h.title}
            </div>
            <div className="text-[11px] leading-tight" style={{ color: "rgba(255,255,255,.85)" }}>
              Antidote+ · {h.subtitle}
            </div>
          </div>
          <span
            className="text-xs font-extrabold rounded-full px-2.5 py-1 shrink-0"
            style={{ background: "rgba(255,255,255,.22)" }}
          >
            {model.severityLabel}
          </span>
        </div>
      </div>

      {/* ── Above the fold: the five things a doctor needs in 5 seconds ───── */}
      <div className="px-4 pt-3 pb-1">
        <div className="grid grid-cols-2 gap-2">
          <HeroCell
            icon={<Activity size={15} />}
            label={h.severity}
            value={model.severityLabel}
            tone={tone}
            pale={model.severityPale}
          />
          <HeroCell
            icon={<Clock size={15} />}
            label={h.timeSinceBite}
            value={model.timeSince}
            tone={C.orange}
            pale={C.orangePale}
          />
        </div>

        {/* Suspected snake */}
        <div
          className="mt-2 rounded-xl px-3 py-2.5 flex items-center gap-2"
          style={{ background: "#F2F7F6" }}
        >
          <ShieldAlert size={16} style={{ color: model.snakeVenomous ? C.danger : C.teal }} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px]" style={{ color: C.muted }}>{h.snake}</div>
            <div className="text-sm font-bold truncate" style={{ color: C.dark }}>{model.snakeName}</div>
          </div>
          {model.snakeVenomous && (
            <span
              className="text-[11px] font-bold rounded px-1.5 py-0.5 shrink-0"
              style={{ background: C.dangerPale, color: C.danger }}
            >
              {h.venomous}
            </span>
          )}
          <div className="text-right shrink-0">
            <div className="text-[11px]" style={{ color: C.muted }}>{h.confidence}</div>
            <div className="text-sm font-bold tabular-nums" style={{ color: C.dark }}>{model.confidence}</div>
          </div>
        </div>

        {/* Destination hospital + ETA + distance */}
        <div
          className="mt-2 rounded-xl px-3 py-2.5"
          style={{ background: C.tealPale }}
        >
          <div className="flex items-center gap-2">
            <Building2 size={16} style={{ color: C.teal }} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px]" style={{ color: C.teal }}>{h.hospital}</div>
              <div className="text-sm font-extrabold truncate" style={{ color: C.tealDark }}>
                {model.hospitalName}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <MiniStat icon={<Timer size={13} />} label={h.eta} value={model.eta} />
            <MiniStat icon={<MapPin size={13} />} label={h.distance} value={model.distance} />
          </div>
        </div>
      </div>

      {/* ── Clinical preparation ──────────────────────────────────────────── */}
      <div className="px-4 pt-3">
        <SectionTitle icon={<HeartPulse size={14} />} label={h.treatment} />
        <div className="rounded-xl px-3 py-2.5 mt-1.5" style={{ background: "#F8FBFA", border: "1px solid #E6EFEE" }}>
          <ul className="flex flex-col gap-1">
            {model.treatment.map((step, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs leading-snug" style={{ color: C.dark }}>
                <span className="mt-1.5 rounded-full shrink-0" style={{ width: 5, height: 5, background: C.teal }} />
                {step}
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-1 gap-1.5 mt-2">
            <InlineRow icon={<Droplets size={13} style={{ color: C.orange }} />} label={h.antivenom} value={model.antivenom} strong />
            <InlineRow
              icon={<ClipboardList size={13} style={{ color: model.icuAvailable ? C.good : C.muted }} />}
              label={h.icu}
              value={model.icuValue}
              note={model.icuAvailable ? h.icuAvailable : null}
            />
          </div>
        </div>
      </div>

      {/* ── Current symptoms ──────────────────────────────────────────────── */}
      <div className="px-4 pt-3">
        <SectionTitle icon={<Activity size={14} />} label={h.symptoms} />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {Array.isArray(model.symptoms) ? (
            model.symptoms.map((s, i) => (
              <span
                key={i}
                className="text-xs font-semibold rounded-full px-2.5 py-1"
                style={{ background: model.severityPale, color: C.dark }}
              >
                {s}
              </span>
            ))
          ) : (
            <span className="text-xs" style={{ color: C.muted }}>{model.notRecorded}</span>
          )}
        </div>
      </div>

      {/* ── Record details ────────────────────────────────────────────────── */}
      <div className="px-4 pt-3">
        <SectionTitle icon={<ClipboardList size={14} />} label={h.status} />
        <div className="mt-1.5 rounded-xl overflow-hidden" style={{ border: "1px solid #E6EFEE" }}>
          <DetailRow label={h.status} value={model.statusValue} />
          <DetailRow label={h.biteTime} value={model.biteTime} />
          <DetailRow label={h.gps} value={model.gps} />
          <DetailRow label={h.contact} value={model.contact} />
          <DetailRow label={h.language} value={model.languageName} last />
        </div>
      </div>

      {/* ── Patient details (optional) ────────────────────────────────────── */}
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between">
          <SectionTitle icon={<User size={14} />} label={h.patientDetails} />
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs font-semibold flex items-center gap-1"
              style={{ color: C.teal }}
            >
              {h.addPatient}
              <ChevronDown size={13} />
            </button>
          )}
        </div>

        {editing ? (
          <div className="mt-1.5 rounded-xl px-3 py-3 flex flex-col gap-2" style={{ background: "#F8FBFA", border: "1px solid #E6EFEE" }}>
            <PatientField icon={<User size={15} />} value={pId} onChange={setPId} placeholder={h.patientId} />
            <PatientField icon={<Clock size={15} />} value={pAge} onChange={setPAge} placeholder={h.age} type="number" />
            <div className="grid grid-cols-3 gap-1.5">
              {["male", "female", "other"].map((g) => {
                const active = pGender === g;
                return (
                  <button
                    key={g}
                    onClick={() => setPGender(active ? "" : g)}
                    className="rounded-lg border text-xs font-semibold py-2 transition-colors"
                    style={{
                      borderColor: active ? C.teal : "#D7E3E2",
                      background: active ? C.tealPale : "#fff",
                      color: active ? C.teal : C.muted,
                    }}
                  >
                    {h.genderOpts[g]}
                  </button>
                );
              })}
            </div>
            <button
              onClick={savePatient}
              className="w-full rounded-xl text-white font-semibold active:scale-[.98] transition-transform"
              style={{ background: C.teal, height: 44, fontSize: 14 }}
            >
              {h.save}
            </button>
          </div>
        ) : (
          <div className="mt-1.5 rounded-xl overflow-hidden" style={{ border: "1px solid #E6EFEE" }}>
            <DetailRow label={h.patientId} value={model.patientId} />
            <DetailRow label={h.age} value={model.age} />
            <DetailRow label={h.gender} value={model.gender} last />
          </div>
        )}
      </div>

      {/* ── Footer: updated + offline + actions ───────────────────────────── */}
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: C.muted }}>
          <RadioTower size={12} style={{ color: C.tealLight }} />
          <span>{h.updated}: <span className="font-semibold tabular-nums" style={{ color: C.dark }}>{model.updated}</span></span>
          {!model.online && (
            <span className="ml-auto flex items-center gap-1 font-semibold" style={{ color: C.amber }}>
              <WifiOff size={12} />
              {h.offlineNote}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onCopy}
            className="rounded-xl font-bold flex items-center justify-center gap-1.5 active:scale-[.98] transition-transform border bg-white"
            style={{ borderColor: C.teal, color: flash === "copied" ? C.good : C.teal, height: 48, fontSize: 14 }}
          >
            {flash === "copied" ? <Check size={16} /> : <Copy size={16} />}
            {flash === "copied" ? h.copied : h.copy}
          </button>
          <button
            onClick={onShare}
            className="rounded-xl text-white font-bold flex items-center justify-center gap-1.5 active:scale-[.98] transition-transform"
            style={{ background: C.teal, height: 48, fontSize: 14 }}
          >
            <Share2 size={16} />
            {h.share}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Presentational sub-pieces ───────────────────────────────────────────── */

function HeroCell({ icon, label, value, tone, pale }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: pale }}>
      <div className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: tone }}>
        {icon}
        {label}
      </div>
      <div className="text-lg font-extrabold leading-tight mt-0.5" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}

function MiniStat({ icon, label, value }) {
  return (
    <div className="rounded-lg px-2 py-1.5 bg-white" style={{ border: "1px solid #DCEAE9" }}>
      <div className="flex items-center gap-1 text-[10px]" style={{ color: C.muted }}>
        {icon}
        {label}
      </div>
      <div className="text-sm font-extrabold tabular-nums leading-tight" style={{ color: C.tealDark }}>
        {value}
      </div>
    </div>
  );
}

function SectionTitle({ icon, label }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: C.muted }}>
      <span style={{ color: C.teal }}>{icon}</span>
      {label}
    </div>
  );
}

function InlineRow({ icon, label, value, note, strong }) {
  return (
    <div className="flex items-start gap-1.5 text-xs leading-snug">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <span style={{ color: C.muted }}>{label}: </span>
        <span className={strong ? "font-bold" : "font-semibold"} style={{ color: C.dark }}>{value}</span>
        {note && <span className="ml-1 font-semibold" style={{ color: C.good }}>· {note}</span>}
      </div>
    </div>
  );
}

function DetailRow({ label, value, last }) {
  return (
    <div
      className="flex items-start justify-between gap-3 px-3 py-2 bg-white"
      style={last ? undefined : { borderBottom: "1px solid #EEF4F3" }}
    >
      <span className="text-xs shrink-0" style={{ color: C.muted }}>{label}</span>
      <span className="text-xs font-semibold text-right" style={{ color: C.dark }}>{value}</span>
    </div>
  );
}

function PatientField({ icon, value, onChange, placeholder, type = "text" }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border px-3" style={{ borderColor: "#D7E3E2", height: 44, background: "#fff" }}>
      <span style={{ color: C.tealLight }} className="shrink-0">{icon}</span>
      <input
        type={type}
        inputMode={type === "number" ? "numeric" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 min-w-0 text-sm bg-transparent outline-none"
        style={{ color: C.dark }}
      />
    </div>
  );
}
