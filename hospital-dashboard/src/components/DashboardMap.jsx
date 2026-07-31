import React, { useEffect, useState, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

const HOSPITAL_COORDS = {
  cmrims: { lat: 17.59620, lng: 78.48630 },
  srikara: { lat: 17.53142, lng: 78.48750 },
  mrn: { lat: 17.54399, lng: 78.43338 },
  govt_medchal: { lat: 17.62972, lng: 78.48139 },
  chc_shamirpet: { lat: 17.59280, lng: 78.57480 },
  area_malkajgiri: { lat: 17.45048, lng: 78.53212 }
};

const USER_ICON = L.divIcon({
  className: "db-user-icon",
  html: '<span class="db-pulse"></span><span class="db-dot"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const HOSPITAL_ICON = L.divIcon({
  className: "db-hosp-icon",
  html:
    '<svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M15 0C7 0 1 6 1 13.5 1 23 15 38 15 38S29 23 29 13.5C29 6 23 0 15 0Z" fill="#0D6E6E"/>' +
    '<circle cx="15" cy="13.5" r="7" fill="#fff"/>' +
    '<path d="M15 9.3v8.4M10.8 13.5h8.4" stroke="#0D6E6E" stroke-width="2.4" stroke-linecap="round"/>' +
    "</svg>",
  iconSize: [30, 38],
  iconAnchor: [15, 36],
});

const GATE_ICON = L.divIcon({
  className: "db-gate-icon",
  html:
    '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="12" cy="12" r="10" fill="#1F8A5B" stroke="#fff" stroke-width="2"/>' +
    '<path d="M9 12l2 2 4-4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

export default function DashboardMap({ victimLoc, hospitalId }) {
  const [map, setMap] = useState(null);
  const [route, setRoute] = useState(null);
  const [simulatedPos, setSimulatedPos] = useState(victimLoc);

  const dest = useMemo(() => {
    return HOSPITAL_COORDS[hospitalId] || HOSPITAL_COORDS.cmrims;
  }, [hospitalId]);

  const gate = useMemo(() => {
    return { lat: dest.lat + 0.0002, lng: dest.lng + 0.0002 };
  }, [dest]);

  useEffect(() => {
    setSimulatedPos(victimLoc);
  }, [victimLoc]);

  useEffect(() => {
    if (!victimLoc || !dest) return;

    let active = true;
    const fetchRoute = async () => {
      try {
        const url = `${OSRM_URL}/${victimLoc.lng},${victimLoc.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        if (active && data.code === "Ok" && data.routes && data.routes[0]) {
          const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          setRoute(coords);
        }
      } catch {
        if (active) {
          setRoute([
            [victimLoc.lat, victimLoc.lng],
            [dest.lat, dest.lng]
          ]);
        }
      }
    };

    fetchRoute();
    return () => { active = false; };
  }, [victimLoc, dest]);

  // Simulate ambulance movement along route
  useEffect(() => {
    if (!victimLoc || !dest || !route || route.length < 2) return;
    
    let timer;
    let currentIdx = 0;
    
    // Detect if this is the mock case start coordinates
    const isMockCase = Math.abs(victimLoc.lat - 17.6297) < 0.005;
    if (isMockCase) {
      timer = setInterval(() => {
        if (currentIdx < route.length - 1) {
          currentIdx += 2; // move 2 waypoints at a time for faster visual progress
          const nextVal = route[Math.min(currentIdx, route.length - 1)];
          setSimulatedPos({ lat: nextVal[0], lng: nextVal[1] });
        }
      }, 1500);
    }
    return () => clearInterval(timer);
  }, [victimLoc, dest, route]);

  useEffect(() => {
    if (!map) return;
    if (route && route.length >= 2) {
      map.fitBounds(route, { padding: [30, 30] });
    }
  }, [map, route]);

  return (
    <div className="relative rounded-2xl overflow-hidden border" style={{ height: "300px", borderColor: "var(--line)", position: "relative" }}>
      <style>{`
        .db-user-icon { position: relative; }
        .db-user-icon .db-dot {
          position: absolute; left: 50%; top: 50%; width: 14px; height: 14px;
          margin: -7px 0 0 -7px; border-radius: 50%;
          background: var(--teal-light); border: 2px solid #fff;
          box-shadow: 0 0 0 1px rgba(0,0,0,.18);
        }
        .db-user-icon .db-pulse {
          position: absolute; left: 50%; top: 50%; width: 22px; height: 22px;
          margin: -11px 0 0 -11px; border-radius: 50%;
          background: rgba(24, 152, 152, 0.35); animation: dbPulse 1.8s ease-out infinite;
        }
        @keyframes dbPulse {
          0% { transform: scale(.5); opacity: .8; }
          80%, 100% { transform: scale(2.4); opacity: 0; }
        }
        .db-hosp-icon { filter: drop-shadow(0 2px 4px rgba(0,0,0,.25)); }
        .db-gate-icon { filter: drop-shadow(0 2px 4px rgba(0,0,0,.2)); }
        .leaflet-control-attribution { font-size: 8px; }
      `}</style>

      <MapContainer
        center={[dest.lat, dest.lng]}
        zoom={14}
        zoomControl={true}
        ref={setMap}
        style={{ height: "100%", width: "100%", zIndex: 1 }}
      >
        <TileLayer url={OSM_URL} attribution={OSM_ATTR} />
        {simulatedPos && <Marker position={[simulatedPos.lat, simulatedPos.lng]} icon={USER_ICON} />}
        <Marker position={[dest.lat, dest.lng]} icon={HOSPITAL_ICON} />
        <Marker position={[gate.lat, gate.lng]} icon={GATE_ICON} />

        {route && route.length >= 2 && (
          <Polyline
            positions={route}
            pathOptions={{
              color: "var(--teal-light)",
              weight: 5,
              opacity: 0.85,
              lineJoin: "round",
              lineCap: "round"
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
