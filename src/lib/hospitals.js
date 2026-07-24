/**
 * Antidote+ â€” live hospital antivenom-stock feed (client side).
 *
 * The routing hero's whole premise is "go to the facility that ACTUALLY has ASV
 * in stock." This module turns that from a hardcoded array into a real
 * fetched-with-timestamp feed, while staying offline-first and demo-safe:
 *
 *   live    â€” fetched just now from the backend registry (GET /api/hospitals).
 *   cached  â€” the last good response, replayed from IndexedDB/localStorage when
 *             the backend is unreachable; "updated N min ago" keeps ageing.
 *   seed    â€” the bundled inventory, used on a cold first run with no network.
 *
 * SEED_FACILITIES mirrors backend/app/services/hospitals.py so the offline
 * fallback and the live feed agree. `fetchHospitals()` never throws â€” it always
 * resolves to a usable facility list plus the source it came from.
 */

import { idbGet, idbSet } from "./db.js";

const API_BASE = (import.meta.env?.VITE_API_BASE ?? "").replace(/\/+$/, "");
const CACHE_KEY = "antidote:hospitals:cmr-v2";

/**
 * Bundled inventory in the shape the routing engine consumes (`tierKey`,
 * `updatedMin`). Values match the backend seed so live/cached/seed agree.
 */
// Facilities near CMR Group of Institutions, Kandlakoya / Medchal Road.
// Seeded as three government and three private antivenom-capable facilities so
// the offline route map still reflects the current demo geography.
export const SEED_FACILITIES = [
  // Private
  { id: "cmrims",          name: "CMR Institute of Medical Sciences",     tierKey: "tertiary", lat: 17.59620, lng: 78.48630, vials: 28, icu: true,  sector: "private", beds: 32, updatedMin: 12 },
  { id: "srikara",         name: "Srikara Hospitals, Kompally",          tierKey: "tertiary", lat: 17.53142, lng: 78.48750, vials: 20, icu: true,  sector: "private", beds: 26, updatedMin: 24 },
  { id: "mrn",             name: "Malla Reddy Narayana Multispeciality", tierKey: "tertiary", lat: 17.54399, lng: 78.43338, vials: 22, icu: true,  sector: "private", beds: 30, updatedMin: 20 },
  // Government
  { id: "govt_medchal",    name: "Government Hospital, Medchal",         tierKey: "ah",       lat: 17.62972, lng: 78.48139, vials: 18, icu: false, sector: "govt",    beds: 18, updatedMin: 18 },
  { id: "chc_shamirpet",   name: "CHC Shamirpet",                        tierKey: "chc",      lat: 17.59280, lng: 78.57480, vials: 14, icu: false, sector: "govt",    beds: 12, updatedMin: 42 },
  { id: "area_malkajgiri", name: "Area Hospital Malkajgiri",             tierKey: "ah",       lat: 17.45048, lng: 78.53212, vials: 24, icu: false, sector: "govt",    beds: 24, updatedMin: 36 },
];

/** Map a backend record â†’ routing facility shape, computing `updatedMin`. */
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
    /* storage full / blocked â€” the IndexedDB copy still stands */
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
    /* network/parse failure â†’ fall through to cache/seed */
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
 * Push a stock (and optional bed) update for a facility â€” the ASHA-worker action.
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

/**
 * Alert a hospital of an incoming patient â€” the "Confirm & alert hospital"
 * action. POSTs the case to the backend so the hospital web dashboard's
 * "Incoming Cases" shows it live. Never throws (offline-safe); returns the saved
 * record or null on any failure.
 * @param {object} caseData
 * @returns {Promise<object|null>}
 */
export async function submitCase(caseData) {
  try {
    const res = await fetch(`${API_BASE}/api/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(caseData),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Mock cases database shared between Dashboard and Routing */
export const MOCK_INCOMING_CASES = [
  {
    id: "P-882-901",
    severity: "severe",
    species: "Indian Cobra",
    confidence: 0.95,
    gps: "17.629, 78.481",
    eta: 30,
    assignedHospitalId: "govt_medchal",
    assignedHospitalName: "Government Hospital, Medchal",
    status: "enroute"
  },
  {
    id: "P-112-402",
    severity: "moderate",
    species: "Russell's Viper",
    confidence: 0.91,
    gps: "17.596, 78.486",
    eta: 20,
    assignedHospitalId: "cmrims",
    assignedHospitalName: "CMR Institute of Medical Sciences",
    status: "preparing"
  },
  {
    id: "P-491-008",
    severity: "mild",
    species: "Common Sand Boa",
    confidence: 0.78,
    gps: "17.531, 78.488",
    eta: 15,
    assignedHospitalId: "srikara",
    assignedHospitalName: "Srikara Hospitals, Kompally",
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


