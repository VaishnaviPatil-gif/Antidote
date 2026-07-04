/**
 * Antidote+ — live hospital antivenom-stock feed (client side).
 *
 * The routing hero's whole premise is "go to the facility that ACTUALLY has ASV
 * in stock." This module turns that from a hardcoded array into a real
 * fetched-with-timestamp feed, while staying offline-first and demo-safe:
 *
 *   live    — fetched just now from the backend registry (GET /api/hospitals).
 *   cached  — the last good response, replayed from IndexedDB/localStorage when
 *             the backend is unreachable; "updated N min ago" keeps ageing.
 *   seed    — the bundled inventory, used on a cold first run with no network.
 *
 * SEED_FACILITIES mirrors backend/app/services/hospitals.py so the offline
 * fallback and the live feed agree. `fetchHospitals()` never throws — it always
 * resolves to a usable facility list plus the source it came from.
 */

import { idbGet, idbSet } from "./db.js";

const API_BASE = (import.meta.env?.VITE_API_BASE ?? "").replace(/\/+$/, "");
const CACHE_KEY = "antidote:hospitals";

/**
 * Bundled inventory in the shape the routing engine consumes (`tierKey`,
 * `updatedMin`). Values match the backend seed so live/cached/seed agree.
 */
// Real facilities near Malla Reddy University (Maisammaguda, Hyderabad).
// ASV (antivenom) stock reflects the team's own phone survey of these hospitals;
// coordinates geocoded via OpenStreetMap. Pins marked (~) are approximate — the
// name didn't geocode exactly, so verify/adjust lat,lng if a route looks off.
export const SEED_FACILITIES = [
  // ── Private ──
  { id: "mrn",       name: "Malla Reddy Narayana Multispeciality", tierKey: "tertiary", lat: 17.54399, lng: 78.43338, vials: 22,  icu: true,  sector: "private", beds: 30, updatedMin: 20 },
  { id: "slg",       name: "SLG Hospitals, Bachupally",            tierKey: "tertiary", lat: 17.52817, lng: 78.36259, vials: 16,  icu: true,  sector: "private", beds: 24, updatedMin: 35 },
  { id: "reach",     name: "Reach Super Speciality Hospital",      tierKey: "tertiary", lat: 17.54900, lng: 78.48700, vials: 12,  icu: true,  sector: "private", beds: 18, updatedMin: 48 }, // (~)
  // ── Government ──
  { id: "arundathi", name: "Arundathi Hospital",                   tierKey: "ah",       lat: 17.52300, lng: 78.46200, vials: 8,   icu: false, sector: "govt",    beds: 8,  updatedMin: 60 }, // (~)
  { id: "basti",     name: "Basti Dawakhana (Dulapally)",          tierKey: "phc",      lat: 17.51288, lng: 78.44052, vials: 0,   icu: false, sector: "govt",    beds: 0,  updatedMin: 90 },
  { id: "gandhi",    name: "Gandhi Hospital, Secunderabad",        tierKey: "tertiary", lat: 17.42312, lng: 78.50345, vials: 120, icu: true,  sector: "govt",    beds: 40, updatedMin: 15 },
];

/** Map a backend record → routing facility shape, computing `updatedMin`. */
function toFacility(r, nowMs) {
  const updatedMs = Date.parse(r.updated_at);
  const updatedMin = Number.isFinite(updatedMs)
    ? Math.max(0, Math.round((nowMs - updatedMs) / 60000))
    : 0;
  return {
    id: r.id,
    name: r.name,
    tierKey: r.tier,
    lat: r.lat,
    lng: r.lng,
    vials: typeof r.vials === "number" ? r.vials : 0,
    icu: !!r.icu,
    sector: r.sector || "govt",
    beds: typeof r.beds === "number" ? r.beds : 0,
    updatedMin,
  };
}

/** Read the last cached response from IndexedDB, then localStorage. */
async function readCache() {
  const fromIdb = await idbGet(CACHE_KEY);
  if (fromIdb && Array.isArray(fromIdb.records)) return fromIdb;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.records)) return parsed;
    }
  } catch {
    /* ignore parse/storage errors */
  }
  return null;
}

function writeCache(cache) {
  idbSet(CACHE_KEY, cache);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full / blocked — the IndexedDB copy still stands */
  }
}

/**
 * Fetch the live inventory, degrading gracefully to cache then seed.
 * @returns {Promise<{facilities:Array, source:"live"|"cached"|"seed", updatedAt:string|null}>}
 */
export async function fetchHospitals() {
  try {
    const res = await fetch(`${API_BASE}/api/hospitals`, {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.hospitals) && data.hospitals.length) {
        const serverMs = Date.parse(data.server_time) || Date.now();
        writeCache({
          records: data.hospitals,
          serverTime: data.server_time,
          cachedAt: new Date().toISOString(),
        });
        return {
          facilities: data.hospitals.map((r) => toFacility(r, serverMs)),
          source: "live",
          updatedAt: data.server_time,
        };
      }
    }
  } catch {
    /* network/parse failure → fall through to cache/seed */
  }

  const cached = await readCache();
  if (cached && Array.isArray(cached.records) && cached.records.length) {
    return {
      facilities: cached.records.map((r) => toFacility(r, Date.now())),
      source: "cached",
      updatedAt: cached.cachedAt || null,
    };
  }

  return { facilities: SEED_FACILITIES, source: "seed", updatedAt: null };
}

/**
 * Push a stock (and optional bed) update for a facility — the ASHA-worker action.
 * Online-only by nature; throws on failure so the caller can surface an error.
 * @param {string} id
 * @param {{vials:number, beds?:number}} update
 * @returns {Promise<object>} the updated backend record
 */
export async function updateStock(id, { vials, beds }) {
  const body = { vials };
  if (typeof beds === "number") body.beds = beds;
  const res = await fetch(`${API_BASE}/api/hospitals/${encodeURIComponent(id)}/stock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`stock update failed (${res.status})`);
  return res.json();
}

/** Mock cases database shared between Dashboard and Routing */
export const MOCK_INCOMING_CASES = [
  {
    id: "P-882-901",
    severity: "severe",
    species: "Indian Cobra",
    confidence: 0.95,
    gps: "17.523, 78.462",
    eta: 30,
    assignedHospitalId: "gandhi",
    assignedHospitalName: "Gandhi Hospital, Secunderabad",
    status: "enroute"
  },
  {
    id: "P-112-402",
    severity: "moderate",
    species: "Russell's Viper",
    confidence: 0.91,
    gps: "17.544, 78.433",
    eta: 20,
    assignedHospitalId: "mrn",
    assignedHospitalName: "Malla Reddy Narayana Multispeciality",
    status: "preparing"
  },
  {
    id: "P-491-008",
    severity: "mild",
    species: "Common Sand Boa",
    confidence: 0.78,
    gps: "17.528, 78.363",
    eta: 15,
    assignedHospitalId: "slg",
    assignedHospitalName: "SLG Hospitals, Bachupally",
    status: "arrived"
  }
];

export function getRequiredVials(severity) {
  return severity === "severe" ? 10 : severity === "moderate" ? 6 : 4;
}

export function getPredictedRemainingVials(facility, liveCase) {
  const stock = facility.vials;
  let incomingVials = 0;

  MOCK_INCOMING_CASES.forEach(c => {
    if (c.assignedHospitalId === facility.id) {
      const status = localStorage.getItem(`dashboard.mock.status.${c.id}`) || c.status;
      if (status === "preparing" || status === "enroute") {
        incomingVials += getRequiredVials(c.severity);
      }
    }
  });

  if (liveCase && liveCase.assignedHospitalId === facility.id) {
    const status = localStorage.getItem("dashboard.live.status") || "preparing";
    if (status === "preparing" || status === "enroute") {
      incomingVials += getRequiredVials(liveCase.severity);
    }
  }

  return stock - incomingVials;
}

export function getCapacityRating(remaining, requiredVials) {
  if (remaining >= requiredVials) return "green";
  if (remaining > 0) return "yellow";
  return "red";
}
