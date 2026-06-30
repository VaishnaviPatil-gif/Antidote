/**
 * Antidote+ — shared geo math for live navigation (Priority 2).
 *
 * Pure, dependency-free helpers. The distance + ETA model is intentionally the
 * SAME one the Routing hero uses inline (haversine + a 35 km/h rural-road
 * assumption), so the figures shown during live navigation stay consistent with
 * the routing decision that started it. Kept here (not inside the hero) so the
 * navigation overlay and the location hook can share one implementation without
 * touching Routing.jsx's self-contained code.
 */

/** Rural single-lane road assumption (km/h) — matches Routing.jsx. */
export const RURAL_SPEED_KMH = 35;

/** Below this ground speed (km/h) we treat the user as effectively stopped. */
export const MIN_MOVING_KMH = 3;

/** Distance (metres) the user must move before we flag a route recalculation. */
export const RECALC_THRESHOLD_M = 60;

/** Within this distance (metres) of the destination we consider them arrived. */
export const ARRIVAL_RADIUS_M = 120;

const toRad = (d) => (d * Math.PI) / 180;

/**
 * Great-circle distance between two {lat,lng} points, in kilometres.
 * @param {{lat:number,lng:number}} a
 * @param {{lat:number,lng:number}} b
 * @returns {number} km
 */
export function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Same distance in metres (convenience for movement thresholds). */
export function haversineM(a, b) {
  return haversineKm(a, b) * 1000;
}

/**
 * Estimated road minutes to cover `km`. Uses a live `speedKmh` when the user is
 * genuinely moving, otherwise falls back to the rural-road assumption so the ETA
 * stays sensible while stopped at a junction. Always at least 1 minute.
 * @param {number} km
 * @param {number} [speedKmh] current ground speed
 * @returns {number} minutes
 */
export function etaMin(km, speedKmh) {
  const v = speedKmh && speedKmh >= MIN_MOVING_KMH ? speedKmh : RURAL_SPEED_KMH;
  return Math.max(1, Math.round((km / v) * 60));
}

/**
 * Convert a GPS speed in metres/second to km/h, clamped to >= 0. Returns null
 * when the fix carries no usable speed (null / NaN / negative sentinel).
 * @param {number|null|undefined} mps
 * @returns {number|null}
 */
export function mpsToKmh(mps) {
  if (mps == null || Number.isNaN(mps) || mps < 0) return null;
  return mps * 3.6;
}

/**
 * Derive speed (km/h) from two timestamped fixes when the device doesn't supply
 * one. Guards against zero/negative time deltas.
 * @param {{lat:number,lng:number,timestamp:number}} prev
 * @param {{lat:number,lng:number,timestamp:number}} next
 * @returns {number|null}
 */
export function derivedKmh(prev, next) {
  if (!prev || !next) return null;
  const dtHr = (next.timestamp - prev.timestamp) / 3_600_000;
  if (dtHr <= 0) return null;
  const km = haversineKm(prev, next);
  return km / dtHr;
}

/**
 * Project point `p` onto segment a→b using a local equirectangular plane (km),
 * accurate to well under a metre over route-segment lengths. Returns the
 * projection point, the clamped parameter t∈[0,1], and the perpendicular
 * distance from `p` to the segment.
 */
function projectOnSegment(p, a, b) {
  const latRef = toRad(a.lat);
  const px = toRad(p.lng - a.lng) * Math.cos(latRef) * 6371;
  const py = toRad(p.lat - a.lat) * 6371;
  const bx = toRad(b.lng - a.lng) * Math.cos(latRef) * 6371;
  const by = toRad(b.lat - a.lat) * 6371;
  const len2 = bx * bx + by * by;
  let t = len2 === 0 ? 0 : (px * bx + py * by) / len2;
  t = Math.max(0, Math.min(1, t));
  const projX = bx * t;
  const projY = by * t;
  const proj = {
    lat: a.lat + (projY / 6371) * (180 / Math.PI),
    lng: a.lng + (projX / (6371 * Math.cos(latRef))) * (180 / Math.PI),
  };
  return { proj, t, distKm: Math.hypot(px - projX, py - projY) };
}

/**
 * Remaining road distance (km) from the current position to the END of a route
 * polyline, measured ALONG the route. The position is snapped to its nearest
 * point on the route, then the distance to the route's end is summed. This is
 * what a real nav app shows — accurate and live on every fix — instead of a
 * stale full-route figure or a straight-line crow-flies estimate.
 *
 * @param {Array<[number,number]>} coords  route as [lat,lng] pairs
 * @param {{lat:number,lng:number}} current
 * @returns {number|null} remaining km, or null if inputs are unusable
 */
export function remainingAlongRouteKm(coords, current) {
  if (!Array.isArray(coords) || coords.length < 2 || !current) return null;
  const p = { lat: current.lat, lng: current.lng };

  let bestIdx = 0;
  let bestDist = Infinity;
  let bestProj = { lat: coords[0][0], lng: coords[0][1] };
  for (let i = 0; i < coords.length - 1; i += 1) {
    const a = { lat: coords[i][0], lng: coords[i][1] };
    const b = { lat: coords[i + 1][0], lng: coords[i + 1][1] };
    const { proj, distKm } = projectOnSegment(p, a, b);
    if (distKm < bestDist) {
      bestDist = distKm;
      bestIdx = i;
      bestProj = proj;
    }
  }

  let remaining = haversineKm(bestProj, {
    lat: coords[bestIdx + 1][0],
    lng: coords[bestIdx + 1][1],
  });
  for (let i = bestIdx + 1; i < coords.length - 1; i += 1) {
    remaining += haversineKm(
      { lat: coords[i][0], lng: coords[i][1] },
      { lat: coords[i + 1][0], lng: coords[i + 1][1] }
    );
  }
  return remaining;
}

/** Human distance: metres under 1 km, else one-decimal km. */
export function formatDistance(km) {
  if (km == null || Number.isNaN(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

/** Human duration from minutes: "8 min" or "1 hr 5 min". */
export function formatDuration(min) {
  if (min == null || Number.isNaN(min)) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/**
 * Clock time `min` minutes from `from`, as a locale HH:MM string.
 * @param {number} min
 * @param {Date} [from]
 */
export function formatClock(min, from = new Date()) {
  if (min == null || Number.isNaN(min)) return "—";
  const d = new Date(from.getTime() + min * 60_000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Compact "17.2701, 77.7703" coordinate label. */
export function formatCoords(p) {
  if (!p || p.lat == null || p.lng == null) return "—";
  return `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
}
