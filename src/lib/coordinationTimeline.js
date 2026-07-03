/**
 * Antidote+ — emergency coordination timeline (business-logic layer).
 *
 * Turns the raw EmergencyContext state plus the live SOS send/queue state into
 * an ordered list of coordination events and the severity-derived hospital
 * preparation checklist. ALL logic lives here so <EmergencyTimeline> stays
 * purely presentational.
 *
 * The nine events, in order:
 *   bite → gps → hospital → route → notified → handover → preparing → enroute → arrival
 *
 * No fake medical data is invented:
 *   • Each event's completion is read from real context (biteTime, victimLocation,
 *     recommendedHospital) or the real send/queue state.
 *   • Preparation is derived only from severity, reusing `requiredVialsFor` — the
 *     same vial thresholds the routing engine and the clinician handover use.
 *   • Timestamps are the real wall-clock moment each milestone was reached in the
 *     app, captured live and persisted per-bite so a reload keeps them.
 */

import { requiredVialsFor } from "./handover.js";
import { formatDistance, formatDuration, formatCoords } from "./geo.js";
import { minutesSinceBite } from "../context/EmergencyContext.jsx";

/** Canonical event order — an event's index here drives its status. */
export const STEP_ORDER = [
  "bite", "gps", "hospital", "route",
  "notified", "handover", "preparing", "enroute", "arrival",
];

/** key → index lookup for the steps above. */
export const STEP_INDEX = STEP_ORDER.reduce((m, k, i) => {
  m[k] = i;
  return m;
}, {});

/**
 * Coordination stages that auto-advance AFTER the alert is sent
 * (handover → preparing → enroute → arrival → done). The SOS timer drives this;
 * kept here so the model and its driver agree on one number.
 */
export const COORD_STAGES = 4;

/**
 * Index of the current (in-progress) step. Everything before it is completed,
 * everything after is pending. Derived purely from real state:
 *   • The pre-send milestones gate on context (bite time, location, hospital).
 *   • Once a hospital is selected the flow parks on `notified` — the live SOS
 *     send is the pivot the user controls.
 *   • After the alert is sent, `coord` (0…COORD_STAGES) walks the hospital-side
 *     coordination forward. At COORD_STAGES the arrival step, too, is complete.
 *
 * @returns {number} 0…STEP_ORDER.length (length ⇒ every step completed)
 */
export function deriveCurrentIndex({ biteTime, victimLocation, recommendedHospital, sendState, coord }) {
  if (!biteTime) return STEP_INDEX.bite;
  if (!victimLocation) return STEP_INDEX.gps;
  if (!recommendedHospital) return STEP_INDEX.hospital;
  if (sendState !== "sent") return STEP_INDEX.notified;
  return Math.min(STEP_INDEX.handover + coord, STEP_ORDER.length);
}

/**
 * Hospital preparation checklist — derived ONLY from severity (never invented).
 * ICU is added only for severe envenomation; the ASV count reuses the shared
 * severity→vials mapping so it matches routing and the handover card exactly.
 *
 * @param {{severity:string, t:object}} input
 * @returns {{vials:number, items:string[]}}
 */
export function buildPreparation({ severity, t }) {
  const p = t.timeline.prep;
  const vials = requiredVialsFor(severity);
  const items = [];
  if (severity === "severe" || severity === "critical") items.push(p.icu);
  items.push(p.physician);
  items.push(p.asv(vials));
  items.push(p.triage);
  return { vials, items };
}

/** HH:MM for a stored stamp (Date or ISO string). */
function formatClockAt(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** "just now" / "3 min ago" between a stamp and `now`, localised. */
function relativeAgo(d, now, tl) {
  const date = d instanceof Date ? d : new Date(d);
  const m = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
  return m <= 0 ? tl.justNow : `${m} ${tl.min} ${tl.ago}`;
}

/**
 * Build the ordered timeline model consumed by <EmergencyTimeline>.
 *
 * @param {object} input
 * @param {object} input.t             active i18n table
 * @param {Date}   input.now           caller-supplied clock (keeps "ago" live)
 * @param {number} input.currentIndex  from deriveCurrentIndex()
 * @param {Object<string,Date>} input.stamps  per-step completion timestamps
 * @param {Date|null} input.biteTime
 * @param {{lat:number,lng:number}|null} input.victimLocation
 * @param {string|null} input.victimLabel
 * @param {string} input.severity
 * @param {{name:string,eta:number,km:number,icu:boolean}|null} input.recommendedHospital
 * @param {{name:string,phone:string}|null} input.emergencyContact
 * @param {"idle"|"sending"|"sent"|"queued"} input.sendState
 * @param {boolean} input.online
 * @returns {Array<object>} one entry per step
 */
export function buildTimeline(input) {
  const {
    t, now, currentIndex, stamps,
    biteTime, victimLocation, victimLabel,
    severity, recommendedHospital, emergencyContact,
    sendState, online,
  } = input;

  const tl = t.timeline;
  const S = tl.steps;

  const gpsDetail = victimLocation
    ? victimLabel || formatCoords(victimLocation)
    : tl.pendingGps;

  const hospName = recommendedHospital?.name || tl.pendingHospital;
  const routeDetail = recommendedHospital
    ? `${tl.eta} ${formatDuration(recommendedHospital.eta)} · ${formatDistance(recommendedHospital.km)}`
    : S.route.desc;

  const contactDetail =
    emergencyContact && (emergencyContact.name || emergencyContact.phone)
      ? [emergencyContact.name, emergencyContact.phone].filter(Boolean).join(" · ")
      : S.notified.desc;

  const vials = requiredVialsFor(severity);
  const isQueued = sendState === "queued" || (!online && sendState !== "sent");

  const defs = [
    { key: "bite",      detail: `${t[severity]} · ${S.bite.desc}` },
    { key: "gps",       detail: gpsDetail },
    { key: "hospital",  detail: hospName },
    { key: "route",     detail: routeDetail },
    { key: "notified",  detail: contactDetail },
    { key: "handover",  detail: S.handover.desc },
    { key: "preparing", detail: tl.prepInline(vials) },
    { key: "enroute",   detail: S.enroute.desc },
    { key: "arrival",   detail: recommendedHospital ? hospName : S.arrival.desc },
  ];

  return defs.map((d, i) => {
    const status = i < currentIndex ? "completed" : i === currentIndex ? "current" : "pending";
    const stamp = stamps?.[d.key] || null;
    return {
      key: d.key,
      title: S[d.key].title,
      detail: d.detail,
      status,
      time: stamp && status !== "pending" ? formatClockAt(stamp) : null,
      ago: stamp && status === "completed" ? relativeAgo(stamp, now, tl) : null,
      queued: d.key === "notified" && isQueued,
    };
  });
}

// ── Timestamp persistence ────────────────────────────────────────────────────
// Keyed to the current bite so a page reload keeps the real milestone times and
// a brand-new emergency (new biteTime) starts a fresh, empty log.

const STAMP_PREFIX = "antidote.timeline.";

function stampKey(biteTime) {
  return STAMP_PREFIX + (biteTime ? new Date(biteTime).getTime() : "none");
}

/** Load persisted stamps for this bite, revived to Dates. */
export function loadStamps(biteTime) {
  try {
    const raw = localStorage.getItem(stampKey(biteTime));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out = {};
    for (const k of Object.keys(parsed)) out[k] = new Date(parsed[k]);
    return out;
  } catch {
    return {};
  }
}

/** Persist stamps (ISO) for this bite. Non-fatal if storage is unavailable. */
export function saveStamps(biteTime, stamps) {
  try {
    const plain = {};
    for (const k of Object.keys(stamps)) plain[k] = new Date(stamps[k]).toISOString();
    localStorage.setItem(stampKey(biteTime), JSON.stringify(plain));
  } catch {
    /* storage full / unavailable — timeline still works, just without times */
  }
}

/**
 * Stamp every step up to and including the current one (so the in-progress step
 * shows when it started), preserving any stamp already recorded. `bite`/`gps`
 * are captured together at emergency start, so they anchor to the real bite time
 * rather than the moment the timeline first rendered.
 *
 * @returns the same object when nothing changed (lets callers skip a write).
 */
export function stampCompleted(stamps, currentIndex, biteTime, now = new Date()) {
  let changed = false;
  const next = { ...stamps };
  const upto = Math.min(currentIndex, STEP_ORDER.length - 1);
  for (let i = 0; i <= upto; i += 1) {
    const key = STEP_ORDER[i];
    if (!next[key]) {
      next[key] =
        (key === "bite" || key === "gps") && biteTime ? new Date(biteTime) : now;
      changed = true;
    }
  }
  return changed ? next : stamps;
}
