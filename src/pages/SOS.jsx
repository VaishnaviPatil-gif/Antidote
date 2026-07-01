import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Send, Clock, Activity, MapPin, User, Phone, Pencil, RefreshCw,
  CheckCircle2, Loader2, Building2, Hospital as HospitalIcon, Inbox, ChevronRight,
} from "lucide-react";
import { C, SEVERITY_TONE } from "../theme.js";
import { tFor } from "../i18n.js";
import { useEmergency, minutesSinceBite } from "../context/EmergencyContext.jsx";
import { useOnline } from "../hooks/useOnline.js";
import { composeSummary, buildAlertMessage, DEMO_RECOMMENDED } from "../lib/handover.js";
import EmergencyTimeline from "../components/EmergencyTimeline.jsx";
import {
  buildTimeline, buildPreparation, deriveCurrentIndex,
  loadStamps, saveStamps, stampCompleted, COORD_STAGES,
} from "../lib/coordinationTimeline.js";

/**
 * SOS / family alert + Emergency Coordination Timeline (§2.7).
 *
 * The screen is framed as a live coordination timeline (<EmergencyTimeline>):
 * bite → GPS → hospital → route → contact notified → handover → hospital
 * preparing → en route → arrival. Every event's status is derived from real
 * EmergencyContext state and the live send/queue state (lib/coordinationTimeline
 * holds all the logic), so a judge sees several parties being mobilised at once.
 *
 * The original SOS controls are unchanged and now DRIVE the timeline: it still
 * composes ONE message from context, lets the user edit it, and SIMULATES the
 * send (no real SMS / phone APIs — demo-safe, can't fail on stage). Offline, the
 * alert is queued with a visible indicator and auto-sends when signal returns;
 * the timeline shows the same queued state. Once sent, a timer walks the
 * hospital-side coordination (handover → preparing → en route → arrival) forward.
 *
 * Writes only `emergencyContact` to context; everything else is read. Real
 * per-milestone timestamps are persisted locally, keyed to the current bite.
 */
export default function SOS() {
  const navigate = useNavigate();
  const {
    language, biteTime, victimLocation, victimLabel, severity, symptomLog,
    emergencyContact, setEmergencyContact, recommendedHospital,
  } = useEmergency();
  const t = tFor(language);
  const online = useOnline();

  // Live clock for the time-since-bite figure.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const mins = minutesSinceBite(biteTime, now);

  // Recommended hospital comes from routing (Step 10); until then, the seeded
  // demo facility so this screen and the message are always complete.
  const hospital = recommendedHospital || DEMO_RECOMMENDED;

  const summary = useMemo(
    () => (symptomLog.length ? composeSummary(symptomLog, biteTime, new Date()) : ""),
    [symptomLog, biteTime]
  );

  // ── Editable message ───────────────────────────────────────────────────
  const buildCurrent = useCallback(
    () =>
      buildAlertMessage(t, {
        label: victimLabel,
        location: victimLocation,
        mins: minutesSinceBite(biteTime, new Date()),
        severity,
        summary,
        hospital,
      }),
    [t, victimLabel, victimLocation, biteTime, severity, summary, hospital]
  );

  const [message, setMessage] = useState("");
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    // Keep the preview in sync with context until the user edits it by hand.
    if (!edited) setMessage(buildCurrent());
  }, [buildCurrent, edited]);

  // ── Emergency contact ──────────────────────────────────────────────────
  const [editingContact, setEditingContact] = useState(!emergencyContact);
  const [cName, setCName] = useState(emergencyContact?.name || "");
  const [cPhone, setCPhone] = useState(emergencyContact?.phone || "");
  const saveContact = useCallback(() => {
    setEmergencyContact({ name: cName.trim(), phone: cPhone.trim() });
    setEditingContact(false);
  }, [cName, cPhone, setEmergencyContact]);

  // ── Send state machine: idle | sending | sent | queued ─────────────────
  const [sendState, setSendState] = useState("idle");
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const doSend = useCallback(() => {
    setSendState("sending");
    timerRef.current = setTimeout(() => setSendState("sent"), 1500);
  }, []);

  const handleSend = useCallback(() => {
    if (sendState === "sending" || sendState === "sent") return;
    if (!online) {
      setSendState("queued"); // queue locally; auto-send when signal returns
      return;
    }
    doSend();
  }, [sendState, online, doSend]);

  // Auto-send a queued alert the moment connectivity returns.
  useEffect(() => {
    if (sendState === "queued" && online) doSend();
  }, [online, sendState, doSend]);

  // ── Coordination timeline ──────────────────────────────────────────────
  // Once the alert is sent, walk the hospital-side coordination forward one
  // stage at a time (handover → preparing → en route → arrival) — the same
  // demo-safe simulation pattern the routing confirm + the send already use.
  const [coord, setCoord] = useState(0);
  useEffect(() => {
    if (sendState !== "sent") {
      setCoord(0);
      return undefined;
    }
    if (coord >= COORD_STAGES) return undefined;
    const id = setTimeout(() => setCoord((c) => Math.min(c + 1, COORD_STAGES)), 1800);
    return () => clearTimeout(id);
  }, [sendState, coord]);

  const currentIndex = deriveCurrentIndex({
    biteTime, victimLocation, recommendedHospital, sendState, coord,
  });

  // Persist the real wall-clock time each milestone is reached, keyed to this
  // bite so a reload keeps them and a new emergency starts fresh.
  const [stamps, setStamps] = useState(() => loadStamps(biteTime));
  useEffect(() => setStamps(loadStamps(biteTime)), [biteTime]);
  useEffect(() => {
    setStamps((prev) => {
      const next = stampCompleted(prev, currentIndex, biteTime, new Date());
      if (next !== prev) saveStamps(biteTime, next);
      return next;
    });
  }, [currentIndex, biteTime]);

  const timelineSteps = useMemo(
    () =>
      buildTimeline({
        t, now, currentIndex, stamps,
        biteTime, victimLocation, victimLabel,
        severity, recommendedHospital, emergencyContact,
        sendState, online,
      }),
    [
      t, now, currentIndex, stamps, biteTime, victimLocation, victimLabel,
      severity, recommendedHospital, emergencyContact, sendState, online,
    ]
  );

  const preparation = useMemo(() => buildPreparation({ severity, t }), [severity, t]);

  // Compact notification status shown on the contact card (mirrors the timeline).
  const contactStatus = useMemo(() => {
    if (sendState === "sent") {
      const stamp = stamps.notified;
      const m = stamp
        ? Math.max(0, Math.floor((now.getTime() - new Date(stamp).getTime()) / 60000))
        : null;
      return {
        label: t.timeline.notifiedLabel,
        tone: C.good,
        pale: C.goodPale,
        ago: m == null ? null : m <= 0 ? t.timeline.justNow : `${m} ${t.timeline.min} ${t.timeline.ago}`,
      };
    }
    if (sendState === "queued" || !online) {
      return { label: t.timeline.queuedLabel, tone: C.amber, pale: C.amberPale, ago: null };
    }
    return null;
  }, [sendState, online, stamps.notified, now, t]);

  const sevTone = SEVERITY_TONE[severity];

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      {/* ── Title ──────────────────────────────────────────────── */}
      <div className="flex items-start gap-2">
        <Send size={20} style={{ color: C.teal }} className="shrink-0 mt-0.5" />
        <div>
          <h1 className="text-lg font-extrabold leading-tight" style={{ color: C.dark }}>
            {t.sos.title}
          </h1>
          <p className="text-xs leading-snug" style={{ color: C.muted }}>
            {t.sos.subtitle}
          </p>
        </div>
      </div>

      {/* ── Key facts (live) ───────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <Fact
          icon={<Clock size={15} />}
          value={mins != null ? `${mins}` : "—"}
          unit={t.common.min}
          label={t.sos.timeSince}
          tone={C.teal}
        />
        <Fact
          icon={<Activity size={15} />}
          value={t[severity]}
          label={t.severity}
          tone={sevTone}
        />
        <Fact
          icon={<MapPin size={15} />}
          value={victimLabel ? victimLabel.split(",")[0] : victimLocation ? "GPS" : "—"}
          label={t.victim}
          tone={C.teal}
          small
        />
      </div>

      {/* ── Emergency coordination timeline (live) ─────────────── */}
      <EmergencyTimeline steps={timelineSteps} preparation={preparation} t={t} />

      {/* ── Emergency contact ──────────────────────────────────── */}
      <section className="rounded-2xl bg-white border" style={{ borderColor: "#E1EAE9" }}>
        <div className="px-4 py-2.5 flex items-center justify-between border-b" style={{ borderColor: "#EEF4F3" }}>
          <span className="text-sm font-bold" style={{ color: C.dark }}>
            {t.sos.contactTitle}
          </span>
          {emergencyContact && !editingContact && (
            <button
              onClick={() => setEditingContact(true)}
              className="flex items-center gap-1 text-xs font-semibold"
              style={{ color: C.teal }}
            >
              <Pencil size={12} />
              {t.sos.edit}
            </button>
          )}
        </div>

        {editingContact ? (
          <div className="px-4 py-3 flex flex-col gap-2">
            <Field
              icon={<User size={16} />}
              value={cName}
              onChange={setCName}
              placeholder={t.sos.namePlaceholder}
            />
            <Field
              icon={<Phone size={16} />}
              value={cPhone}
              onChange={setCPhone}
              placeholder={t.sos.phonePlaceholder}
              type="tel"
            />
            <button
              onClick={saveContact}
              disabled={!cName.trim() && !cPhone.trim()}
              className="w-full rounded-xl text-white font-semibold active:scale-[.98] transition-transform disabled:opacity-50"
              style={{ background: C.teal, height: 46, fontSize: 14 }}
            >
              {t.sos.save}
            </button>
          </div>
        ) : (
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="rounded-lg p-2 shrink-0" style={{ background: C.tealPale }}>
              <User size={18} style={{ color: C.teal }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate" style={{ color: C.dark }}>
                {emergencyContact?.name || t.sos.noContact}
              </div>
              {emergencyContact?.phone && (
                <div className="text-xs tabular-nums" style={{ color: C.muted }}>
                  {emergencyContact.phone}
                </div>
              )}
            </div>
            {/* Notification status — mirrors the timeline's contact step. */}
            {emergencyContact && contactStatus && (
              <div className="text-right shrink-0">
                <span
                  className="text-[11px] font-bold rounded-full px-2 py-0.5"
                  style={{ background: contactStatus.pale, color: contactStatus.tone }}
                >
                  {contactStatus.label}
                </span>
                {contactStatus.ago && (
                  <div className="text-[10px] mt-0.5" style={{ color: C.muted }}>
                    {contactStatus.ago}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Editable message preview ───────────────────────────── */}
      <section className="rounded-2xl bg-white border overflow-hidden" style={{ borderColor: "#E1EAE9" }}>
        <div className="px-4 py-2.5 flex items-center justify-between border-b" style={{ borderColor: "#EEF4F3" }}>
          <span className="text-sm font-bold" style={{ color: C.dark }}>
            {t.sos.messagePreview}
          </span>
          <button
            onClick={() => {
              setEdited(false);
              setMessage(buildCurrent());
            }}
            className="flex items-center gap-1 text-xs font-semibold"
            style={{ color: C.teal }}
          >
            <RefreshCw size={12} />
            {t.sos.regenerate}
          </button>
        </div>
        <div className="px-4 py-3">
          <label htmlFor="sos-msg" className="sr-only">
            {t.sos.messagePreview}
          </label>
          <textarea
            id="sos-msg"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setEdited(true);
            }}
            rows={7}
            className="w-full rounded-xl border px-3 py-2 text-sm leading-snug resize-none"
            style={{ borderColor: "#D7E3E2", color: C.dark, background: "#F8FBFA" }}
          />
          {/* Hospital relay line */}
          <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: C.muted }}>
            <Building2 size={13} style={{ color: C.tealLight }} />
            {recommendedHospital ? (
              <span>
                {t.sos.relayHospital} <span className="font-semibold">{hospital.name}</span>
              </span>
            ) : (
              <span>{t.sos.noHospitalYet}</span>
            )}
          </div>
        </div>
      </section>

      {/* ── Send / states ──────────────────────────────────────── */}
      {sendState === "sent" ? (
        <div className="flex flex-col gap-2">
          <div className="rounded-2xl px-4 py-3 flex items-start gap-3" style={{ background: C.goodPale }}>
            <CheckCircle2 size={22} style={{ color: C.good }} className="shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold" style={{ color: C.good }}>
                {t.sos.sent}
              </div>
              <div className="text-xs leading-snug" style={{ color: C.dark }}>
                {t.sos.sentBody}
              </div>
              {emergencyContact?.name && (
                <div className="text-xs mt-0.5" style={{ color: C.muted }}>
                  {t.sos.recipient}: {emergencyContact.name}
                  {emergencyContact.phone ? ` · ${emergencyContact.phone}` : ""}
                </div>
              )}
            </div>
          </div>

          {/* Demo affordance — see the same handoff from the hospital's side. */}
          <button
            onClick={() => navigate("/hospital")}
            className="w-full rounded-xl text-white font-bold flex items-center justify-center gap-2 active:scale-[.98] transition-transform"
            style={{ background: C.teal, height: 52, fontSize: 16 }}
          >
            <HospitalIcon size={18} />
            {t.sos.viewHospital}
            <ChevronRight size={18} />
          </button>
        </div>
      ) : sendState === "queued" ? (
        <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: C.amberPale }}>
          <Inbox size={20} style={{ color: C.amber }} className="shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold" style={{ color: C.amber }}>
              {t.sos.queued}
            </div>
            <div className="text-xs" style={{ color: C.muted }}>
              {t.sos.autoSend}
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={handleSend}
          disabled={sendState === "sending"}
          className="w-full rounded-xl text-white font-bold flex items-center justify-center gap-2 active:scale-[.98] transition-transform disabled:opacity-80"
          style={{ background: C.orange, height: 54, fontSize: 16, boxShadow: "0 8px 24px rgba(232,106,23,.18)" }}
        >
          {sendState === "sending" ? (
            <>
              <span className="ap-spin inline-flex">
                <Loader2 size={18} />
              </span>
              {t.sos.sending}
            </>
          ) : (
            <>
              <Send size={18} />
              {t.sos.sendBtn}
            </>
          )}
        </button>
      )}
    </div>
  );
}

/* ── Reusable presentational pieces ───────────────────────────────────────── */

/** Compact stat block mirroring the routing screen's big-number cards. */
function Fact({ icon, value, unit, label, tone, small }) {
  return (
    <div className="rounded-xl px-2 py-2 text-center bg-white border" style={{ borderColor: "#E8F0EF" }}>
      <div className="flex items-center justify-center gap-1" style={{ color: tone }}>
        {icon}
        <span className={`font-extrabold ${small ? "text-sm" : "text-base"} leading-tight`}>
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

/** Labelled text input with a leading icon. */
function Field({ icon, value, onChange, placeholder, type = "text" }) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl border px-3"
      style={{ borderColor: "#D7E3E2", height: 48, background: "#fff" }}
    >
      <span style={{ color: C.tealLight }} className="shrink-0">
        {icon}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 min-w-0 text-base bg-transparent outline-none"
        style={{ color: C.dark }}
      />
    </div>
  );
}
