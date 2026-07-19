import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Send, Clock, Activity, MapPin, User, Phone, RefreshCw,
  CheckCircle2, Loader2, Building2, Hospital as HospitalIcon, Inbox, ChevronRight,
  X, Plus, Star, Share2, Check, HeartPulse,
} from "lucide-react";
import { C, SEVERITY_TONE } from "../theme.js";
import { tFor } from "../i18n.js";
import { useEmergency, minutesSinceBite } from "../context/EmergencyContext.jsx";
import { useOnline } from "../hooks/useOnline.js";
import { composeSummary, buildAlertMessage, mapsLink, DEMO_RECOMMENDED } from "../lib/handover.js";
import { startCall, openSms, shareOrCopy } from "../lib/share.js";
import { warn } from "../lib/haptics.js";
import EmergencyTimeline from "../components/EmergencyTimeline.jsx";
import BackButton from "../components/BackButton.jsx";
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
    emergencyContact, emergencyContacts, addEmergencyContact,
    removeEmergencyContact, setPrimaryContact, recommendedHospital,
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

  // ── Emergency contacts (multiple family members) ────────────────────────
  const contacts = emergencyContacts || [];
  const [showAdd, setShowAdd] = useState(contacts.length === 0);
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const addContact = useCallback(() => {
    if (!cName.trim() && !cPhone.trim()) return;
    addEmergencyContact({ name: cName.trim(), phone: cPhone.trim() });
    setCName("");
    setCPhone("");
    setShowAdd(false);
  }, [cName, cPhone, addEmergencyContact]);

  // Every saved phone number, for texting the whole family in one composer.
  const allPhones = useMemo(
    () => contacts.map((c) => c.phone).filter(Boolean),
    [contacts]
  );

  // Share just the live-location link via the native share sheet (falls back to
  // clipboard). Quicker than the full alert when someone only needs the pin.
  const [locShared, setLocShared] = useState(false);
  const shareLocation = useCallback(async () => {
    const link = mapsLink(victimLocation);
    if (!link) return;
    const res = await shareOrCopy({ title: t.sos.shareLoc, text: link });
    if (res === "shared" || res === "copied") {
      setLocShared(true);
      setTimeout(() => setLocShared(false), 2500);
    }
  }, [victimLocation, t]);

  // ── Send state machine: idle | sending | sent | queued ─────────────────
  const [sendState, setSendState] = useState("idle");
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const doSend = useCallback(() => {
    // Fire the REAL SMS composer to EVERY saved family number at once — this
    // opens the device's messaging app prefilled with the alert (location link
    // included). The coordination timeline below still advances so the on-stage
    // demo shows the hospital-side mobilisation even if the composer is dismissed.
    warn(); // firm haptic — an SOS is being dispatched to family
    if (allPhones.length) openSms(allPhones.join(","), message);
    setSendState("sending");
    timerRef.current = setTimeout(() => setSendState("sent"), 1500);
  }, [allPhones, message]);

  const handleSend = useCallback(() => {
    if (sendState === "sending" || sendState === "sent") return;
    if (!online) {
      setSendState("queued"); // queue locally; auto-send when signal returns
      return;
    }
    doSend();
  }, [sendState, online, doSend]);

  // One-tap real phone call to a specific saved contact.
  const handleCall = useCallback((phone) => {
    if (phone) startCall(phone);
  }, []);

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
      <style>{`
        @keyframes sosPulse {
          0%,100% { box-shadow: 0 10px 28px rgba(232,106,23,.32); }
          50% { box-shadow: 0 12px 36px rgba(232,106,23,.55); }
        }
        .ap-sos-send { animation: sosPulse 2s ease-in-out infinite; }
      `}</style>

      {/* ── Title ──────────────────────────────────────────────── */}
      <div className="flex items-start gap-2">
        <BackButton />
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

      {/* ── Link to Responding Resources ── */}
      <button
        onClick={() => navigate("/resources")}
        className="w-full rounded-xl border flex items-center justify-between px-3 py-2.5 text-xs font-bold active:scale-[.99] transition-transform"
        style={{ borderColor: "#C5DBD9", color: C.teal, background: C.tealPale }}
      >
        <span className="flex items-center gap-1.5">
          <HeartPulse size={14} style={{ color: C.teal }} className="animate-pulse" />
          {t.resources?.title || "Track Responding Resources (Ambulance, ASHA, Police)"}
        </span>
        <ChevronRight size={14} style={{ color: C.teal }} />
      </button>

      {/* ── Emergency coordination timeline (live) ─────────────── */}
      <EmergencyTimeline steps={timelineSteps} preparation={preparation} t={t} />

      {/* ── Emergency contacts (family members) ────────────────── */}
      <section className="rounded-2xl bg-white border" style={{ borderColor: "#E1EAE9" }}>
        <div className="px-4 py-2.5 flex items-center justify-between border-b" style={{ borderColor: "#EEF4F3" }}>
          <span className="text-sm font-bold" style={{ color: C.dark }}>
            {t.sos.contactTitle}
          </span>
          {/* Quick share of just the live-location link (native share sheet). */}
          {victimLocation && (
            <button
              onClick={shareLocation}
              className="flex items-center gap-1 text-xs font-semibold active:scale-95 transition-transform"
              style={{ color: locShared ? C.good : C.teal }}
            >
              {locShared ? <Check size={13} /> : <Share2 size={13} />}
              {locShared ? t.sos.locShared : t.sos.shareLoc}
            </button>
          )}
        </div>

        {/* Saved contacts — tap a name to make primary; per-contact one-tap call. */}
        {contacts.length > 0 && (
          <ul className="divide-y" style={{ borderColor: "#EEF4F3" }}>
            {contacts.map((c, i) => {
              const isPrimary = i === 0;
              return (
                <li key={c.id} className="px-4 py-2.5 flex items-center gap-3">
                  <button
                    onClick={() => setPrimaryContact(c.id)}
                    className="rounded-lg p-2 shrink-0"
                    style={{ background: isPrimary ? C.teal : C.tealPale }}
                    aria-label={t.sos.makePrimary}
                    title={t.sos.makePrimary}
                  >
                    {isPrimary ? (
                      <Star size={16} style={{ color: "#fff" }} fill="#fff" />
                    ) : (
                      <User size={16} style={{ color: C.teal }} />
                    )}
                  </button>
                  <button
                    onClick={() => setPrimaryContact(c.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold truncate" style={{ color: C.dark }}>
                        {c.name || t.sos.noContact}
                      </span>
                      {isPrimary && (
                        <span
                          className="text-[10px] font-bold rounded-full px-1.5 py-0.5 shrink-0"
                          style={{ background: C.tealPale, color: C.teal }}
                        >
                          {t.sos.primary}
                        </span>
                      )}
                    </div>
                    {c.phone && (
                      <div className="text-xs tabular-nums" style={{ color: C.muted }}>
                        {c.phone}
                      </div>
                    )}
                    {/* Primary contact carries the live notification status. */}
                    {isPrimary && contactStatus && (
                      <div className="mt-0.5">
                        <span
                          className="text-[10px] font-bold rounded-full px-2 py-0.5"
                          style={{ background: contactStatus.pale, color: contactStatus.tone }}
                        >
                          {contactStatus.label}
                          {contactStatus.ago ? ` · ${contactStatus.ago}` : ""}
                        </span>
                      </div>
                    )}
                  </button>
                  {c.phone && (
                    <button
                      onClick={() => handleCall(c.phone)}
                      aria-label={`${t.sos.callNow} ${c.name || ""}`.trim()}
                      className="shrink-0 flex items-center gap-1 rounded-xl px-3 font-bold text-white active:scale-[.97] transition-transform"
                      style={{ background: C.good, height: 38, fontSize: 13 }}
                    >
                      <Phone size={15} />
                      {t.sos.callNow}
                    </button>
                  )}
                  <button
                    onClick={() => removeEmergencyContact(c.id)}
                    aria-label={t.sos.remove}
                    className="shrink-0 rounded-lg p-1.5 active:scale-90 transition-transform"
                    style={{ color: C.muted }}
                  >
                    <X size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Add-contact form (auto-open when the list is empty). */}
        {showAdd ? (
          <div className="px-4 py-3 flex flex-col gap-2 border-t" style={{ borderColor: "#EEF4F3" }}>
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
              onClick={addContact}
              disabled={!cName.trim() && !cPhone.trim()}
              className="w-full rounded-xl text-white font-semibold active:scale-[.98] transition-transform disabled:opacity-50"
              style={{ background: C.teal, height: 46, fontSize: 14 }}
            >
              {t.sos.save}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="w-full px-4 py-2.5 flex items-center justify-center gap-1.5 text-xs font-bold border-t active:scale-[.99] transition-transform"
            style={{ borderColor: "#EEF4F3", color: C.teal }}
          >
            <Plus size={14} />
            {t.sos.addAnother}
          </button>
        )}

        {contacts.length > 0 && (
          <div className="px-4 pb-2.5 pt-1 text-[11px] leading-snug" style={{ color: C.muted }}>
            {t.sos.contactsHint}
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
          <div className="rounded-2xl px-4 py-4 flex items-start gap-3" style={{ background: C.goodPale, border: `1px solid ${C.good}33` }}>
            <div
              className="rounded-full flex items-center justify-center shrink-0"
              style={{ background: C.good, width: 40, height: 40, boxShadow: `0 6px 16px ${C.good}44` }}
            >
              <CheckCircle2 size={22} style={{ color: "#fff" }} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold" style={{ color: C.good }}>
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
          className={`w-full rounded-2xl text-white font-extrabold flex items-center justify-center gap-2.5 active:scale-[.98] transition-transform disabled:opacity-90 ${sendState === "sending" ? "" : "ap-sos-send"}`}
          style={{
            background: `linear-gradient(135deg, #F5842A 0%, ${C.orange} 55%, #C85A10 100%)`,
            height: 58,
            fontSize: 17,
            boxShadow: "0 10px 28px rgba(232,106,23,.32)",
          }}
        >
          {sendState === "sending" ? (
            <>
              <span className="ap-spin inline-flex">
                <Loader2 size={20} />
              </span>
              {t.sos.sending}
            </>
          ) : (
            <>
              <span
                className="flex items-center justify-center rounded-full"
                style={{ background: "rgba(255,255,255,.22)", width: 32, height: 32 }}
              >
                <Send size={17} />
              </span>
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
