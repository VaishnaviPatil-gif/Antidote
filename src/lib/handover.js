/**
 * Shared handover logic — the single source of truth for the clinician
 * summary, severity→vials mapping, and the SOS alert message. Used by the
 * tracker (summary), SOS (message + summary) and the hospital view (summary +
 * prepare line) so all three speak with one voice and never drift.
 */

/** Severity ordering for trend comparisons. */
export const RANK = { mild: 0, moderate: 1, severe: 2, critical: 3 };

/**
 * ASV vials to prepare for a given severity (same thresholds the routing
 * engine uses to size "adequate" stock).
 * @param {"mild"|"moderate"|"severe"|"critical"} severity
 * @returns {number}
 */
export function requiredVialsFor(severity) {
  if (severity === "critical") return 15;
  return severity === "severe" ? 10 : severity === "moderate" ? 6 : 4;
}

/**
 * Demo fallback for the recommended hospital, used only until the routing
 * screen writes the real choice into context (Step 10). Matches the seeded
 * District Hospital Vikarabad scenario from the routing data.
 */
export const DEMO_RECOMMENDED = {
  name: "District Hospital Vikarabad",
  tierKey: "dh",
  eta: 27,
  km: 16,
  vials: 30,
  icu: true,
};

/**
 * Compose a clinician-facing handover sentence locally.
 *
 * PLACEHOLDER for POST /api/summarize (Gemini) — the backend will later return
 * a refined, localized sentence. Until then this deterministic composer keeps
 * the app fully functional and offline-safe. Kept in English: the clinical
 * lingua franca for hospital handover in India.
 *
 * @param {Array} log - symptomLog entries ({ t, answers, level })
 * @param {Date|null} biteTime
 * @param {Date} now
 * @returns {string}
 */
export function composeSummary(log, biteTime, now) {
  if (!log.length) return "";
  const last = log[log.length - 1];
  const a = last.answers;
  const mins = biteTime
    ? Math.max(0, Math.floor((now.getTime() - new Date(biteTime).getTime()) / 60000))
    : null;

  const swell =
    { none: "no spreading swelling", local: "local swelling only", spreading: "swelling spreading up the limb" }[
      a.swelling
    ] || "swelling not noted";

  const signs = [];
  if (a.breathing === "yes") signs.push("breathing difficulty");
  if (a.vision === "yes") signs.push("ptosis / blurred or double vision");
  if (a.bleeding === "yes") signs.push("bleeding from gums, urine or bite site");
  if (a.drowsy === "yes") signs.push("drowsiness or slurred speech");

  const neuro = a.vision === "yes" || a.drowsy === "yes";
  const hemato = a.bleeding === "yes";
  const impression = neuro && hemato
    ? "possible neuro- and haematotoxic envenomation"
    : neuro
    ? "possible neurotoxic envenomation"
    : hemato
    ? "possible haematotoxic envenomation"
    : last.level === "mild"
    ? "local effects only so far"
    : "systemic features developing";

  let trend = `severity ${last.level}`;
  if (log.length >= 2) {
    const d = RANK[last.level] - RANK[log[log.length - 2].level];
    trend += d > 0 ? " and rising" : d < 0 ? " and easing" : " and stable";
  }

  const minsStr = mins != null ? `${mins}-min-old bite` : "bite (time unknown)";
  const signStr = signs.length ? `; ${signs.join(", ")}` : "";
  return `${minsStr}; ${swell}${signStr}. Impression: ${impression}, ${trend}. Prepare for snakebite envenomation; share with receiving hospital.`;
}

/**
 * Build the family/hospital alert message entirely from emergency context.
 * Localised labels with emoji anchors for scannability in a chat; the clinical
 * summary stays English. Returned as plain text so it can be edited freely
 * before the (simulated) send.
 *
 * @param {object} t - the active i18n string table
 * @param {object} fields - { label, location, mins, severity, summary, hospital }
 * @returns {string}
 */
export function buildAlertMessage(t, { label, location, mins, severity, summary, hospital }) {
  const lines = [`🆘 ${t.home.bittenBtn}`];
  if (mins != null) lines.push(`⏱ ${t.firstAid.timeSince}: ${mins} ${t.common.min}`);
  lines.push(`📊 ${t.severity}: ${t[severity]}`);

  const coord = location ? `(${location.lat.toFixed(3)}, ${location.lng.toFixed(3)})` : "";
  const place = [label, coord].filter(Boolean).join(" ");
  if (place) lines.push(`📍 ${t.victim}: ${place}`);
  // A tappable maps link so the recipient can navigate straight to the victim.
  const link = mapsLink(location);
  if (link) lines.push(`🗺 ${link}`);

  if (summary) lines.push(`📝 ${summary}`);
  if (hospital) lines.push(`🏥 ${t.goHere}: ${hospital.name} · ${hospital.eta} ${t.common.min}`);

  return lines.join("\n");
}

/**
 * Build a Google Maps link for a {lat,lng} the recipient can tap to navigate.
 * Returns "" when no location is known so callers can skip the line.
 * @param {{lat:number,lng:number}|null|undefined} location
 * @returns {string}
 */
export function mapsLink(location) {
  if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
    return "";
  }
  return `https://maps.google.com/?q=${location.lat.toFixed(5)},${location.lng.toFixed(5)}`;
}
