/**
 * Region-scoped snake occurrence data — OFFLINE fallback for snake ID.
 *
 * When the photo analyzer can't reach the AI (offline / no network), we can
 * still help: this shows the snakes actually RECORDED in the victim's district,
 * so they can compare what they saw against the local species — venomous flags
 * front and centre.
 *
 * Scope is deliberately LIMITED to the demo operating area — Telangana districts
 * around Malla Reddy University (Maisammaguda / Medchal / Hyderabad) — NOT the
 * full national dataset. Source: the team's field dataset (Snakes_List.csv).
 * Each district carries an approximate centroid so we pick the nearest one from
 * the victim's GPS; if there's no fix we fall back to the demo home district.
 */

import { haversineKm } from "../lib/geo.js";

const V = true; // venomous — needs antivenom
const N = false;

// The recurring Hyderabad-basin species set (shared by most nearby districts in
// the dataset). Venomous listed first so the dangerous ones read at a glance.
const HYD_BASIN = [
  { name: "Indian Cobra", sci: "Naja naja", venomous: V },
  { name: "Russell's Viper", sci: "Daboia russelii", venomous: V },
  { name: "Oriental Rat Snake", sci: "Ptyas mucosa", venomous: N },
  { name: "Chequered Keelback", sci: "Fowlea piscator", venomous: N },
  { name: "Common Bronzeback Tree Snake", sci: "Dendrelaphis tristis", venomous: N },
  { name: "Indian Vine Snake", sci: "Ahaetulla oxyrhynca", venomous: N },
  { name: "Rough-scaled Sand Boa", sci: "Eryx conicus", venomous: N },
];

// Telangana districts in/around the demo area, with approximate centroids.
export const REGION_DISTRICTS = [
  { district: "Medchal–Malkajgiri", state: "Telangana", lat: 17.63, lng: 78.48, snakes: HYD_BASIN },
  { district: "Hyderabad", state: "Telangana", lat: 17.385, lng: 78.487, snakes: HYD_BASIN },
  { district: "Sangareddy", state: "Telangana", lat: 17.62, lng: 78.09, snakes: HYD_BASIN },
  { district: "Medak", state: "Telangana", lat: 18.04, lng: 78.27, snakes: HYD_BASIN },
  { district: "Vikarabad", state: "Telangana", lat: 17.34, lng: 77.90, snakes: HYD_BASIN },
  { district: "Siddipet", state: "Telangana", lat: 18.10, lng: 78.85, snakes: HYD_BASIN },
  { district: "Yadadri Bhuvanagiri", state: "Telangana", lat: 17.51, lng: 78.88, snakes: HYD_BASIN },
  {
    // Rangareddy carries the krait + spectacled cobra in the dataset.
    district: "Rangareddy", state: "Telangana", lat: 17.20, lng: 78.13,
    snakes: [
      { name: "Spectacled Cobra", sci: "Naja naja", venomous: V },
      { name: "Russell's Viper", sci: "Daboia russelii", venomous: V },
      { name: "Common Krait", sci: "Bungarus caeruleus", venomous: V },
      { name: "Indian Rat Snake", sci: "Ptyas mucosa", venomous: N },
      { name: "Chequered Keelback", sci: "Fowlea piscator", venomous: N },
      { name: "Common Wolf Snake", sci: "Lycodon aulicus", venomous: N },
    ],
  },
];

// Demo home district — used when there's no GPS fix (the app is demoed here).
const DEFAULT_DISTRICT = REGION_DISTRICTS[0];

/**
 * Nearest district record for a location, from the demo-area set above.
 * @param {{lat:number,lng:number}|null|undefined} loc
 * @returns {{district:string,state:string,snakes:Array<{name:string,sci:string,venomous:boolean}>}}
 */
export function snakesForLocation(loc) {
  if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") {
    return DEFAULT_DISTRICT;
  }
  let best = DEFAULT_DISTRICT;
  let bestKm = Infinity;
  for (const d of REGION_DISTRICTS) {
    const km = haversineKm(loc, d);
    if (km < bestKm) {
      bestKm = km;
      best = d;
    }
  }
  return best;
}
