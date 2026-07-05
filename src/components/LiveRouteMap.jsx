import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Plus, Minus, LocateFixed, Compass, MapPin, Clock, ShieldAlert, RefreshCw } from "lucide-react";
import { C } from "../theme.js";
import { tFor } from "../i18n.js";
import { useGeolocation } from "../hooks/useGeolocation.js";
import { haversineKm, haversineM, etaMin, remainingAlongRouteKm, formatDistance, formatDuration } from "../lib/geo.js";

/**
 * LiveRouteMap — real interactive navigation map (replaces the abstract SVG dot
 * visualisation that used to live inside Routing.jsx).
 *
 * Self-contained so Routing.jsx stays clean: it owns the live location stream
 * (reusing the Capacitor-backed useGeolocation hook from the navigation work),
 * the OSRM driving-route fetch, the Leaflet map, markers, polyline and the
 * floating controls. Nothing about the Routing page around it changes.
 *
 * Design choices that honour "do not change the palette": the user marker and
 * the route use the brand teal (the palette's blue-green "you/navigation"
 * colour) instead of a foreign blue, and the hospital marker uses the brand
 * danger red — so the map reads like Google Maps (distinct user vs destination,
 * coloured route) without introducing any off-palette colour.
 *
 * Props:
 *   victim       — { lat, lng } fallback origin until the first GPS fix
 *   recommended  — chosen facility { lat, lng, name, ... } (the destination)
 *   language     — "te" | "hi" | "en"
 */

const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const RECALC_M = 80; // refetch the driving route once the user moves this far
const DEFAULT_CENTER = { lat: 17.5623, lng: 78.4538 }; // Maisammaguda / MRU fallback

/** Pulsing teal "you are here" marker. */
const USER_ICON = L.divIcon({
  className: "lr-user-icon",
  html: '<span class="lr-pulse"></span><span class="lr-dot"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

/** Red hospital pin with a white medical cross. */
const HOSPITAL_ICON = L.divIcon({
  className: "lr-hosp-icon",
  html:
    '<svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M15 0C7 0 1 6 1 13.5 1 23 15 38 15 38S29 23 29 13.5C29 6 23 0 15 0Z" fill="#C0392B"/>' +
    '<circle cx="15" cy="13.5" r="7" fill="#fff"/>' +
    '<path d="M15 9.3v8.4M10.8 13.5h8.4" stroke="#C0392B" stroke-width="2.4" stroke-linecap="round"/>' +
    "</svg>",
  iconSize: [30, 38],
  iconAnchor: [15, 36],
});

/**
 * Bridges Leaflet map events back to React: detects a manual pan (to suspend
 * follow mode) and tracks when the map is mid-move/zoom (to suspend the user
 * marker's CSS transition, avoiding Leaflet's transform-reset slide glitch).
 */
function MapEvents({ onUserPan, setBusy }) {
  useMapEvents({
    dragstart: onUserPan,
    movestart: () => setBusy(true),
    moveend: () => setBusy(false),
    zoomstart: () => setBusy(true),
    zoomend: () => setBusy(false),
  });
  return null;
}

function LiveRouteMap({ victim, recommended, language, onMetrics }) {
  const t = tFor(language);
  const nt = t.navigation;

  // Live location every 5s (Capacitor on Android, browser geolocation on web).
  const { position, lastKnown, status, retry } = useGeolocation({
    enabled: true,
    intervalMs: 5000,
  });

  const dest = useMemo(
    () =>
      recommended && recommended.lat != null && recommended.lng != null
        ? { lat: recommended.lat, lng: recommended.lng }
        : null,
    [recommended]
  );
  // Freshest usable location: live fix → last known → seeded victim origin.
  const user = position || lastKnown || victim || null;

  const [map, setMap] = useState(null);
  const [follow, setFollow] = useState(true);
  const [busy, setBusy] = useState(false); // map mid-move/zoom → freeze marker tween
  const [route, setRoute] = useState(null); // {coords:[[lat,lng]], distanceKm, durationMin, straight}

  const routeRef = useRef(null);
  const anchorRef = useRef(null); // last point a route was computed from
  const destRef = useRef(null);
  const abortRef = useRef(null);
  const fittedRef = useRef(false);

  // ── OSRM driving route (graceful straight-line fallback when unreachable) ──
  const computeRoute = useCallback(async (from, to) => {
    if (!from || !to) return;
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const url = `${OSRM_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url, { signal: ac.signal });
      const data = await res.json();
      if (data.code === "Ok" && data.routes && data.routes[0]) {
        const r = data.routes[0];
        const next = {
          coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
          distanceKm: r.distance / 1000,
          durationMin: Math.max(1, Math.round(r.duration / 60)),
          straight: false,
        };
        routeRef.current = next;
        setRoute(next);
        return;
      }
      throw new Error("no-route");
    } catch (err) {
      if (ac.signal.aborted) return;
      // Offline / OSRM down: a dashed straight segment + haversine estimate so
      // the map still conveys direction & distance instead of crashing.
      const km = haversineKm(from, to);
      const next = {
        coords: [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ],
        distanceKm: km,
        durationMin: etaMin(km),
        straight: true,
      };
      routeRef.current = next;
      setRoute(next);
    }
  }, []);

  // Recompute the route on first fix, when the destination changes, or after a
  // significant move. Read route via ref so this doesn't loop on its own output.
  useEffect(() => {
    if (!user || !dest) return;
    const destChanged =
      !destRef.current || destRef.current.lat !== dest.lat || destRef.current.lng !== dest.lng;
    const moved = anchorRef.current ? haversineM(anchorRef.current, user) : Infinity;
    if (!routeRef.current || destChanged || moved > RECALC_M) {
      anchorRef.current = user;
      destRef.current = dest;
      computeRoute(user, dest);
    }
  }, [user, dest, computeRoute]);

  useEffect(() => () => abortRef.current && abortRef.current.abort(), []);

  // Keep the map sized correctly after the (lazy) mount.
  useEffect(() => {
    if (!map) return undefined;
    const id = setTimeout(() => map.invalidateSize(), 0);
    return () => clearTimeout(id);
  }, [map]);

  // First route → frame the whole trip once; afterwards follow mode takes over.
  useEffect(() => {
    if (!map || !route || fittedRef.current || route.coords.length < 2) return;
    map.fitBounds(route.coords, { padding: [28, 28], maxZoom: 15 });
    fittedRef.current = true;
  }, [map, route]);

  // Follow the user (smooth pan) unless they've manually panned the map.
  useEffect(() => {
    if (!map || !user || !follow || !fittedRef.current) return;
    map.panTo([user.lat, user.lng], { animate: true, duration: 0.8 });
  }, [map, user, follow]);

  const recenter = useCallback(() => {
    setFollow(true);
    if (map && user) map.setView([user.lat, user.lng], Math.max(map.getZoom(), 15), { animate: true });
  }, [map, user]);

  const fitRoute = useCallback(() => {
    setFollow(false);
    if (map && route && route.coords.length >= 2) {
      map.fitBounds(route.coords, { padding: [28, 28], maxZoom: 16 });
    }
  }, [map, route]);

  // Live remaining distance + ETA. For a real OSRM route we measure how much
  // road is left by snapping the current position onto the route geometry and
  // summing to the end — accurate and updated on every fix, not just on the
  // 80 m route recalcs. ETA is that remaining fraction of OSRM's drive time.
  // Without a real route (offline fallback) we fall back to a straight-line
  // estimate so the numbers are still honest. Computed BEFORE the early return
  // below so hook order stays stable across the denied/allowed states.
  const showRouteDistance = useMemo(() => {
    if (route && !route.straight) {
      const rem = remainingAlongRouteKm(route.coords, user);
      if (rem != null) return rem;
    }
    if (user && dest) return haversineKm(user, dest);
    return route ? route.distanceKm : null;
  }, [route, user, dest]);

  const showRouteEta = useMemo(() => {
    if (route && !route.straight && route.distanceKm > 0 && showRouteDistance != null) {
      return Math.max(1, Math.round(route.durationMin * (showRouteDistance / route.distanceKm)));
    }
    return showRouteDistance != null ? etaMin(showRouteDistance) : null;
  }, [route, showRouteDistance]);

  // Report the live road distance/ETA up so the recommended-hospital summary
  // card shows the SAME numbers as the map (not a separate straight-line guess).
  useEffect(() => {
    if (onMetrics && showRouteDistance != null) {
      onMetrics({ km: showRouteDistance, min: showRouteEta });
    }
  }, [onMetrics, showRouteDistance, showRouteEta]);

  const initialCenter = user || dest || DEFAULT_CENTER;

  // ── Permission denied → friendly fallback, never the map (never crashes) ──
  if (status === "denied") {
    return (
      <div
        className="rounded-2xl border flex flex-col items-center justify-center text-center px-5"
        style={{ height: 240, borderColor: "#F0CFC9", background: C.dangerPale }}
      >
        <div className="rounded-full p-3 mb-2" style={{ background: "#F6D9D4" }}>
          <ShieldAlert size={26} style={{ color: C.danger }} />
        </div>
        <div className="text-base font-extrabold" style={{ color: C.danger }}>
          {nt.locationRequired}
        </div>
        <div className="text-xs leading-snug mt-1 mb-3 max-w-[280px]" style={{ color: C.dark }}>
          {nt.permBody}
        </div>
        <div className="flex gap-2">
          <button
            onClick={retry}
            className="rounded-xl text-white font-bold flex items-center justify-center gap-1.5 px-4 active:scale-[.98] transition-transform"
            style={{ background: C.danger, height: 44, fontSize: 14 }}
          >
            <LocateFixed size={15} />
            {nt.enableLocation}
          </button>
          <button
            onClick={retry}
            className="rounded-xl font-bold flex items-center justify-center gap-1.5 px-4 active:scale-[.98] transition-transform bg-white border"
            style={{ borderColor: C.danger, color: C.danger, height: 44, fontSize: 14 }}
          >
            <RefreshCw size={15} />
            {nt.retry}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-2xl overflow-hidden border${busy ? " lr-busy" : ""}`}
      style={{ height: 240, borderColor: "#E1EAE9" }}
    >
      <style>{`
        .lr-user-icon { position: relative; transition: transform .7s linear; }
        .lr-busy .lr-user-icon { transition: none; }
        .lr-user-icon .lr-dot {
          position: absolute; left: 50%; top: 50%; width: 14px; height: 14px;
          margin: -7px 0 0 -7px; border-radius: 50%;
          background: ${C.tealLight}; border: 2px solid #fff;
          box-shadow: 0 0 0 1px rgba(0,0,0,.18);
        }
        .lr-user-icon .lr-pulse {
          position: absolute; left: 50%; top: 50%; width: 22px; height: 22px;
          margin: -11px 0 0 -11px; border-radius: 50%;
          background: ${C.tealLight}59; animation: lrPulse 1.8s ease-out infinite;
        }
        @keyframes lrPulse {
          0% { transform: scale(.5); opacity: .8; }
          80%, 100% { transform: scale(2.4); opacity: 0; }
        }
        .lr-hosp-icon { filter: drop-shadow(0 2px 3px rgba(0,0,0,.3)); }
        /* Keep Leaflet's attribution unobtrusive but present (OSM requires it). */
        .leaflet-control-attribution { font-size: 9px; background: rgba(255,255,255,.7); }
      `}</style>

      <MapContainer
        center={[initialCenter.lat, initialCenter.lng]}
        zoom={13}
        zoomControl={false}
        ref={setMap}
        style={{ height: "100%", width: "100%", background: C.tealPale }}
      >
        <TileLayer url={OSM_URL} attribution={OSM_ATTR} maxZoom={19} />
        <MapEvents onUserPan={() => setFollow(false)} setBusy={setBusy} />

        {route && route.coords.length >= 2 && (
          <Polyline
            positions={route.coords}
            pathOptions={{
              color: C.tealLight,
              weight: 5,
              opacity: 0.9,
              lineJoin: "round",
              lineCap: "round",
              dashArray: route.straight ? "6 9" : undefined,
            }}
          />
        )}

        {dest && <Marker position={[dest.lat, dest.lng]} icon={HOSPITAL_ICON} />}
        {user && <Marker position={[user.lat, user.lng]} icon={USER_ICON} />}
      </MapContainer>

      {/* ── Distance + ETA overlay (top-left) ───────────────────────── */}
      <div
        className="absolute top-2 left-2 rounded-xl px-3 py-1.5 flex items-center gap-3 pointer-events-none"
        style={{ background: "rgba(255,255,255,.94)", boxShadow: "0 2px 8px rgba(10,79,79,.18)", zIndex: 1000 }}
      >
        <div className="flex items-center gap-1" style={{ color: C.teal }}>
          <MapPin size={14} />
          <span className="text-sm font-extrabold tabular-nums">{formatDistance(showRouteDistance)}</span>
        </div>
        <div className="w-px h-4" style={{ background: "#D7E3E2" }} />
        <div className="flex items-center gap-1" style={{ color: C.orange }}>
          <Clock size={14} />
          <span className="text-sm font-extrabold tabular-nums">{formatDuration(showRouteEta)}</span>
        </div>
      </div>

      {/* ── Floating controls (right) ───────────────────────────────── */}
      <div
        className="absolute top-2 right-2 flex flex-col gap-1.5"
        style={{ zIndex: 1000 }}
      >
        <MapBtn onClick={() => map && map.zoomIn()} label="Zoom in"><Plus size={17} /></MapBtn>
        <MapBtn onClick={() => map && map.zoomOut()} label="Zoom out"><Minus size={17} /></MapBtn>
        <MapBtn onClick={recenter} label="Re-center" active={follow}>
          <LocateFixed size={17} />
        </MapBtn>
        <MapBtn onClick={fitRoute} label="Fit route"><Compass size={17} /></MapBtn>
      </div>

      {/* GPS acquiring chip (bottom-left) until the first fix lands. */}
      {status === "requesting" && !position && (
        <div
          className="absolute bottom-2 left-2 rounded-lg px-2.5 py-1 text-xs font-semibold flex items-center gap-1.5"
          style={{ background: "rgba(255,255,255,.94)", color: C.teal, zIndex: 1000 }}
        >
          <span className="lr-acq inline-block w-2 h-2 rounded-full" style={{ background: C.tealLight }} />
          {nt.acquiring}
        </div>
      )}
    </div>
  );
}

/** Small square Google-Maps-style control button. */
function MapBtn({ onClick, label, children, active }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex items-center justify-center rounded-lg active:scale-95 transition-transform"
      style={{
        width: 34,
        height: 34,
        background: "#fff",
        color: active ? C.orange : C.teal,
        boxShadow: "0 2px 6px rgba(10,79,79,.22)",
      }}
    >
      {children}
    </button>
  );
}

// Memoised: location updates re-render only this subtree, never the Routing page.
export default React.memo(LiveRouteMap);
