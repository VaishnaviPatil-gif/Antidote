import { useEffect, useRef, useState } from "react";
import { useEmergency } from "../context/EmergencyContext.jsx";
import { useGeolocation } from "./useGeolocation.js";
import { speak } from "../lib/ttsService.js";

const WS_BASE = (import.meta.env?.VITE_WS_BASE ?? "").replace(/\/+$/, "") ||
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

const API_BASE = (import.meta.env?.VITE_API_BASE ?? "").replace(/\/+$/, "");

const ANNOUNCEMENTS = {
  en: {
    accepted: "The hospital has accepted your case.",
    preparing: "Emergency team is preparing antivenom.",
    ready: "Emergency team is ready. Please proceed to the emergency entrance.",
    arrived: "You have arrived at the hospital.",
    five_mins: "You are five minutes away."
  },
  hi: {
    accepted: "अस्पताल ने आपका मामला स्वीकार कर लिया है।",
    preparing: "आपातकालीन टीम एंटीवेनम तैयार कर रही है।",
    ready: "आपातकालीन टीम तैयार है। कृपया आपातकालीन प्रवेश द्वार पर जाएं।",
    arrived: "आप अस्पताल पहुंच गए हैं।",
    five_mins: "आप पांच मिनट की दूरी पर हैं।"
  },
  te: {
    accepted: "ఆసుపత్రి మీ కేసును స్వీకరించింది.",
    preparing: "అత్యవసర బృందం యాంటీవెనమ్ సిద్ధం చేస్తోంది.",
    ready: "అత్యవసర బృందం సిద్ధంగా ఉంది. దయచేసి అత్యवసర ప్రవేశ ద్వారం వద్దకు వెళ్లండి.",
    arrived: "మీరు ఆసుపత్రికి చేరుకున్నారు.",
    five_mins: "మీరు ఐదు నిమిషాల దూరంలో ఉన్నారు."
  }
};

export function useHospitalSync(caseId) {
  const { patch, language, status: currentStatus, eta_min } = useEmergency();
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const pollTimer = useRef(null);
  const wsFailures = useRef(0);

  const lastStatusSpoken = useRef("");
  const spokeFiveMins = useRef(false);

  // Monitor location changes
  const { position } = useGeolocation({ enabled: !!caseId, intervalMs: 5000 });

  // Voice announcer helper
  const announce = (key) => {
    const lang = language || "en";
    const phrase = ANNOUNCEMENTS[lang]?.[key];
    if (phrase) {
      speak(phrase, lang);
    }
  };

  // Speak on status changes
  useEffect(() => {
    if (currentStatus && currentStatus !== lastStatusSpoken.current) {
      lastStatusSpoken.current = currentStatus;
      if (currentStatus !== "waiting" && currentStatus !== "completed") {
        announce(currentStatus);
      }
    }
  }, [currentStatus]);

  // Speak when 5 minutes away
  useEffect(() => {
    if (eta_min === 5 && !spokeFiveMins.current) {
      spokeFiveMins.current = true;
      announce("five_mins");
    } else if (eta_min > 5) {
      spokeFiveMins.current = false; // Reset if ETA increases
    }
  }, [eta_min]);

  // 1. WebSocket connection loop with Catch-Up Sync logic
  useEffect(() => {
    if (!caseId) return;

    const fetchCatchUp = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/cases/${caseId}/updates`);
        if (res.ok) {
          const data = await res.json();
          patch((prev) => ({
            ...(data.status ? { status: data.status } : {}),
            updates: data.updates || [],
            preparation: data.preparation || {},
            timeline: data.timeline || []
          }));
        }
      } catch {
        // catch-up sync fallback
      }
    };

    const connect = () => {
      try {
        const url = `${WS_BASE}/ws/victim/${caseId}`;
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnectionStatus("ws");
          wsFailures.current = 0;
          if (pollTimer.current) {
            clearInterval(pollTimer.current);
            pollTimer.current = null;
          }
          // Fetch missed events when connection stabilizes
          fetchCatchUp();
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "hospital_update") {
              const u = msg.data;
              if (u.type === "status_change") {
                patch({ status: u.value });
              } else if (u.type === "preparation") {
                patch((prev) => ({
                  preparation: {
                    ...prev.preparation,
                    [u.field]: { value: u.value, ts: u.ts }
                  }
                }));
              }
              // Append to updates & timeline
              patch((prev) => ({
                updates: [...(prev.updates || []), u],
                timeline: [
                  ...(prev.timeline || []),
                  {
                    event: u.message || `${u.field}: ${u.value}`,
                    ts: new Date(u.ts * 1000).toISOString(),
                    source: u.from || "hospital"
                  }
                ]
              }));
            } else if (msg.type === "ping") {
              ws.send(JSON.stringify({ type: "pong" }));
            }
          } catch {
            // Safe JSON parse error skip
          }
        };

        ws.onclose = () => {
          wsFailures.current += 1;
          if (wsFailures.current >= 3) {
            startPolling();
          } else {
            reconnectTimer.current = setTimeout(connect, 3000);
          }
        };
      } catch {
        startPolling();
      }
    };

    const startPolling = () => {
      setConnectionStatus("polling");
      const poll = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/cases/${caseId}/updates`);
          if (res.ok) {
            const data = await res.json();
            patch((prev) => ({
              ...(data.status ? { status: data.status } : {}),
              updates: data.updates || [],
              preparation: data.preparation || {},
              timeline: data.timeline || []
            }));
          }
        } catch {
          // Polling failures handled silently
        }
      };

      poll();
      pollTimer.current = setInterval(poll, 3000);
    };

    connect();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [caseId, patch]);

  // 2. Location Stream WebSocket Sync
  useEffect(() => {
    if (position && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: "location_update",
          data: { lat: position.lat, lng: position.lng }
        }));
      } catch {
        // Safe location transmission fallback
      }
    }
  }, [position]);

  return { connectionStatus, position };
}
