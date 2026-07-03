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
export const SEED_FACILITIES = [
  { id: "phc-marpally", name: "PHC Marpally",                  tierKey: "phc",      lat: 17.262, lng: 77.785, vials: 0,   icu: false, sector: "govt",    beds: 0,  updatedMin: 185 },
  { id: "phc-doulta",   name: "PHC Doultabad",                 tierKey: "phc",      lat: 17.305, lng: 77.730, vials: 2,   icu: false, sector: "govt",    beds: 1,  updatedMin: 540 },
  { id: "chc-tandur",   name: "CHC Tandur",                    tierKey: "chc",      lat: 17.245, lng: 77.575, vials: 8,   icu: false, sector: "govt",    beds: 4,  updatedMin: 41 },
  { id: "ah-vikarabad", name: "Area Hospital Vikarabad",       tierKey: "ah",       lat: 17.337, lng: 77.905, vials: 24,  icu: false, sector: "govt",    beds: 8,  updatedMin: 12 },
  { id: "dh-vikarabad", name: "District Hospital Vikarabad",   tierKey: "dh",       lat: 17.331, lng: 77.901, vials: 30,  icu: true,  sector: "govt",    beds: 15, updatedMin: 25 },
  { id: "chc-parigi",   name: "CHC Parigi",                    tierKey: "chc",      lat: 17.130, lng: 77.870, vials: 0,   icu: false, sector: "govt",    beds: 3,  updatedMin: 95 },
  { id: "gandhi",       name: "Gandhi Hospital, Secunderabad", tierKey: "tertiary", lat: 17.443, lng: 78.499, vials: 120, icu: true,  sector: "govt",    beds: 40, updatedMin: 18 },
  { id: "nims",         name: "NIMS, Hyderabad",               tierKey: "tertiary", lat: 17.428, lng: 78.448, vials: 90,  icu: true,  sector: "govt",    beds: 35, updatedMin: 33 },
  { id: "apollo-hyd",   name: "Apollo Hospital, Hyderabad",    tierKey: "tertiary", lat: 17.412, lng: 78.432, vials: 60,  icu: true,  sector: "private", beds: 28, updatedMin: 22 },
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
    gps: "17.305, 77.730",
    eta: 30,
    assignedHospitalId: "dh-vikarabad",
    assignedHospitalName: "District Hospital Vikarabad",
    status: "enroute"
  },
  {
    id: "P-112-402",
    severity: "moderate",
    species: "Russell's Viper",
    confidence: 0.91,
    gps: "17.130, 77.870",
    eta: 20,
    assignedHospitalId: "ah-vikarabad",
    assignedHospitalName: "Area Hospital Vikarabad",
    status: "preparing"
  },
  {
    id: "P-491-008",
    severity: "mild",
    species: "Common Sand Boa",
    confidence: 0.78,
    gps: "17.245, 77.575",
    eta: 15,
    assignedHospitalId: "chc-tandur",
    assignedHospitalName: "CHC Tandur",
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
