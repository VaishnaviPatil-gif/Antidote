/**
 * Antidote+ — clinician handover derivation (business logic layer).
 *
 * Turns the raw EmergencyContext state into a display-ready model for the
 * <ClinicianHandover> card. ALL logic lives here so the component stays purely
 * presentational: field normalisation, honest "Not Recorded" fallbacks, the
 * derived treatment-preparation / ICU / antivenom guidance, the current symptom
 * list, and the plain-text version used by Copy / Share.
 *
 * Reuses the app's single sources of truth — `requiredVialsFor` (severity→vials,
 * same thresholds the routing engine uses) and the geo formatters — so the card
 * never drifts from the rest of the flow. No fake medical values are invented:
 * every field is either read from state or transparently derived from severity
 * and the logged symptoms; absent data shows "Not Recorded".
 */

import { useEffect, useMemo, useState } from "react";
import { useEmergency, minutesSinceBite } from "../context/EmergencyContext.jsx";
import { useOnline } from "../hooks/useOnline.js";
import { tFor } from "../i18n.js";
import { SEVERITY_TONE, SEVERITY_PALE } from "../theme.js";
import { requiredVialsFor } from "./handover.js";
import { formatDistance, formatDuration, formatCoords, formatClock } from "./geo.js";

/** Snake confidence below this is treated as "unidentified → assume venomous". */
const LOW_CONFIDENCE = 0.6;

/**
 * Build the display model for the handover card. Pure — no hooks, no clock.
 *
 * @param {object} input
 * @param {object} input.t            active i18n table (tFor(language))
 * @param {Date}   input.now          current time (caller supplies the tick)
 * @param {string} input.language     "te" | "hi" | "en"
 * @param {Date|null} input.biteTime
 * @param {{lat:number,lng:number}|null} input.victimLocation
 * @param {string|null} input.victimLabel
 * @param {{species:string,confidence:number,venomous:boolean}|null} input.snake
 * @param {"mild"|"moderate"|"severe"} input.severity
 * @param {Array} input.symptomLog
 * @param {{name:string,phone:string}|null} input.emergencyContact
 * @param {{name:string,eta:number,km:number,vials:number,icu:boolean}|null} input.hospital
 * @param {string|null} input.patientId
 * @param {string|number|null} input.patientAge
 * @param {"male"|"female"|"other"|null} input.patientGender
 * @param {"confirmed"|"enroute"|"pending"} [input.status]
 * @param {boolean} input.online
 * @returns {object} display model consumed by <ClinicianHandover>
 */
export function buildHandoverModel(input) {
  const {
    t, now, language,
    biteTime, victimLocation, victimLabel,
    snake, severity, symptomLog,
    emergencyContact, hospital,
    patientId, patientAge, patientGender,
    status, online,
  } = input;

  const h = t.handover;
  const NR = h.notRecorded;

  // ── Top-of-card triage vitals ────────────────────────────────────────────
  const mins = minutesSinceBite(biteTime, now);
  const timeSince = mins != null ? `${mins} ${t.common.min}` : NR;
  const biteTimeStr = biteTime ? formatClock(0, new Date(biteTime)) : NR;

  const coords = victimLocation ? formatCoords(victimLocation) : null;
  const gps = coords
    ? victimLabel
      ? `${coords} · ${victimLabel}`
      : coords
    : victimLabel || NR;

  const hospitalName = hospital?.name || NR;
  const eta = hospital?.eta != null ? formatDuration(hospital.eta) : NR;
  const distance = hospital?.km != null ? formatDistance(hospital.km) : NR;

  const severityLabel = t[severity] || severity;
  const severityTone = SEVERITY_TONE[severity];
  const severityPale = SEVERITY_PALE[severity];

  // ── Suspected snake + AI confidence ──────────────────────────────────────
  let snakeName;
  let confidence;
  let snakeVenomous = false;
  if (snake && snake.species && snake.species !== "Unidentified" && snake.confidence >= LOW_CONFIDENCE) {
    snakeName = snake.species;
    confidence = `${Math.round(snake.confidence * 100)}%`;
    snakeVenomous = !!snake.venomous;
  } else if (snake) {
    // A photo was taken but the model was unsure — the safe clinical default.
    snakeName = h.assumeVenom;
    confidence = NR;
    snakeVenomous = true;
  } else {
    snakeName = NR;
    confidence = NR;
  }

  // ── Current symptoms (from the latest logged check) ──────────────────────
  const last = symptomLog.length ? symptomLog[symptomLog.length - 1] : null;
  const a = last?.answers || {};
  let symptoms = null; // null → "Not Recorded"
  if (last) {
    const list = [];
    const swell = { local: h.sym.localSwelling, spreading: h.sym.spreadingSwelling }[a.swelling];
    if (swell) list.push(swell);
    if (a.breathing === "yes") list.push(h.sym.breathing);
    if (a.vision === "yes") list.push(h.sym.vision);
    if (a.bleeding === "yes") list.push(h.sym.bleeding);
    if (a.drowsy === "yes") list.push(h.sym.drowsy);
    symptoms = list.length ? list : [h.none];
  }

  // Sign flags drive the (transparent, severity-based) clinical preparation.
  const neuro = a.vision === "yes" || a.drowsy === "yes" || a.breathing === "yes";
  const hemato = a.bleeding === "yes";
  const needsIcu = severity === "severe" || neuro;

  // ── Derived preparation guidance (logistics, not patient-specific data) ──
  const treatment = [h.prep.base];
  if (neuro) treatment.push(h.prep.neuro);
  if (hemato) treatment.push(h.prep.hemato);
  treatment.push(h.prep.monitor);

  const vials = requiredVialsFor(severity);
  const antivenom = `${vials} ${h.vialsUnit}`;

  const icuValue = needsIcu ? h.icuValue.yes : h.icuValue.no;
  const icuAvailable = !!hospital?.icu;

  // ── Status, contact, patient, meta ───────────────────────────────────────
  const statusKey = status || (hospital ? "confirmed" : "pending");
  const statusValue = h.statusValue[statusKey] || h.statusValue.pending;

  const contact =
    emergencyContact && (emergencyContact.name || emergencyContact.phone)
      ? [emergencyContact.name, emergencyContact.phone].filter(Boolean).join(" · ")
      : NR;

  const pId = patientId && `${patientId}`.trim() ? `${patientId}`.trim() : NR;
  const age = patientAge != null && `${patientAge}`.trim() !== "" ? `${patientAge}` : NR;
  const gender = patientGender ? h.genderOpts[patientGender] || patientGender : NR;

  const languageName = h.langName[language] || language;
  const updated = formatClock(0, now);

  const model = {
    // triage / above-the-fold
    severityKey: severity, severityLabel, severityTone, severityPale,
    timeSince, snakeName, confidence, snakeVenomous,
    hospitalName, eta, distance,
    // clinical
    symptoms, antivenom, icuValue, icuAvailable, treatment,
    // record
    biteTime: biteTimeStr, gps, statusValue, contact, languageName,
    patientId: pId, age, gender,
    // meta
    updated, online, notRecorded: NR,
  };

  model.text = formatHandoverText(model, t);
  return model;
}

/**
 * Plain-text handover for Copy / Share. Matches the on-screen card so a pasted
 * message and a screenshot say exactly the same thing. Labels follow the active
 * language; the layout is scannable in a chat or SMS.
 * @param {object} m  model from buildHandoverModel
 * @param {object} t  active i18n table
 * @returns {string}
 */
export function formatHandoverText(m, t) {
  const h = t.handover;
  const line = (label, value) => `${label}: ${value}`;
  const lines = [
    `🚨 ${h.title.toUpperCase()} — Antidote+`,
    line(h.severity, m.severityLabel),
    line(h.timeSinceBite, m.timeSince),
    line(h.snake, m.confidence !== m.notRecorded ? `${m.snakeName} (${m.confidence})` : m.snakeName),
    line(h.hospital, `${m.hospitalName} · ${h.eta} ${m.eta} · ${m.distance}`),
    "—",
    line(h.biteTime, m.biteTime),
    line(h.gps, m.gps),
    line(h.symptoms, Array.isArray(m.symptoms) ? m.symptoms.join("; ") : m.notRecorded),
    line(h.antivenom, m.antivenom),
    line(h.icu, m.icuValue),
    line(h.treatment, m.treatment.join("; ")),
    "—",
    line(h.patientId, m.patientId),
    line(h.age, m.age),
    line(h.gender, m.gender),
    line(h.contact, m.contact),
    line(h.language, m.languageName),
    line(h.status, m.statusValue),
    line(h.updated, m.updated),
  ];
  return lines.join("\n");
}

/**
 * Hook: read EmergencyContext + connectivity, tick a 1-second clock, and return
 * the live handover model. This is where the card gets its automatic updates —
 * any change to ETA, GPS, symptoms, severity, hospital or snake re-renders it,
 * and the clock keeps "time since bite" / "last updated" moving.
 *
 * @param {object} [overrides]
 * @param {object} [overrides.hospital]  richer live facility (e.g. routing's
 *        `recommended`, which carries the freshest eta/km); defaults to the
 *        hospital written into context.
 * @param {"confirmed"|"enroute"|"pending"} [overrides.status]
 * @returns {object} the display model
 */
export function useHandoverModel(overrides = {}) {
  const ctx = useEmergency();
  const online = useOnline();
  const t = tFor(ctx.language);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hospital = overrides.hospital || ctx.recommendedHospital || null;
  const { status } = overrides;

  return useMemo(
    () =>
      buildHandoverModel({
        t,
        now,
        language: ctx.language,
        biteTime: ctx.biteTime,
        victimLocation: ctx.victimLocation,
        victimLabel: ctx.victimLabel,
        snake: ctx.snake,
        severity: ctx.severity,
        symptomLog: ctx.symptomLog,
        emergencyContact: ctx.emergencyContact,
        hospital,
        patientId: ctx.patientId,
        patientAge: ctx.patientAge,
        patientGender: ctx.patientGender,
        status,
        online,
      }),
    [
      t, now, ctx.language, ctx.biteTime, ctx.victimLocation, ctx.victimLabel,
      ctx.snake, ctx.severity, ctx.symptomLog, ctx.emergencyContact, hospital,
      ctx.patientId, ctx.patientAge, ctx.patientGender, status, online,
    ]
  );
}
