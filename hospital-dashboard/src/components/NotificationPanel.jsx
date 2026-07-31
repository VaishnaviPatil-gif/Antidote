import React, { useEffect, useState, useRef } from "react";
import { X, AlertTriangle, Clock, MapPin, Activity, ChevronRight } from "lucide-react";

/**
 * NotificationPanel — floating emergency alert popup.
 *
 * Slides in from top-right when a new snakebite emergency arrives.
 * Shows patient ID, severity, ETA, distance, village.
 * Plays the alarm (handled by useRealtime), displays badge count.
 * Auto-dismisses after 30s but stays in notification queue.
 */

const SEVERITY_COLORS = {
  critical: { bg: "#7A1C1C", text: "#fff", pale: "#FBEBE9" },
  severe:   { bg: "#C0392B", text: "#fff", pale: "#FBEBE9" },
  moderate: { bg: "#B8730A", text: "#fff", pale: "#FBF1E0" },
  mild:     { bg: "#1F8A5B", text: "#fff", pale: "#E7F4EE" },
};

function estimateDistance(gps) {
  if (!gps) return null;
  const parts = gps.split(",").map((s) => parseFloat(s.trim()));
  if (parts.length < 2 || parts.some(isNaN)) return null;
  // Rough distance from a central Hyderabad point
  const dlat = parts[0] - 17.55;
  const dlng = parts[1] - 78.49;
  return Math.sqrt(dlat * dlat + dlng * dlng) * 111;
}

function extractVillage(c) {
  return c.village || c.victimLabel || "Unknown area";
}

export default function NotificationPanel({ notifications, onAcknowledge, onNavigate }) {
  // Show only unacknowledged notifications, newest first, max 3 visible
  const active = notifications
    .filter((n) => !n.acknowledged)
    .slice(0, 3);

  if (active.length === 0) return null;

  return (
    <div className="notification-panel-container">
      {active.map((n, i) => (
        <NotificationToast
          key={n.id}
          notification={n}
          index={i}
          onDismiss={() => onAcknowledge(n.id)}
          onView={() => {
            onAcknowledge(n.id);
            if (onNavigate) onNavigate(n.case);
          }}
        />
      ))}
    </div>
  );
}

function NotificationToast({ notification, index, onDismiss, onView }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);
  const c = notification.case;
  const sev = (c.severity || "severe").toLowerCase();
  const colors = SEVERITY_COLORS[sev] || SEVERITY_COLORS.severe;
  const dist = estimateDistance(c.gps);
  const village = extractVillage(c);

  useEffect(() => {
    // Animate in after a brief delay (stagger per index)
    const showTimer = setTimeout(() => setVisible(true), index * 120);
    // Auto-dismiss after 30s
    timerRef.current = setTimeout(onDismiss, 30_000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(timerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`notification-toast ${visible ? "notification-toast-visible" : ""}`}
      style={{
        "--toast-delay": `${index * 120}ms`,
        borderLeft: `5px solid ${colors.bg}`,
      }}
    >
      {/* Pulsing severity strip */}
      <div
        className="notification-toast-header"
        style={{ background: colors.bg, color: colors.text }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="notification-pulse-icon">🚨</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.5px", textTransform: "uppercase" }}>
              New Snakebite Emergency
            </div>
            <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 600, marginTop: 2 }}>
              {c.species || "Unidentified Snake"} — {sev.toUpperCase()}
            </div>
          </div>
        </div>
        <button
          onClick={onDismiss}
          style={{ color: "rgba(255,255,255,0.7)", background: "none", border: "none", padding: 4 }}
          title="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      {/* Detail body */}
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--dark)" }}>
            Patient ID: {c.id}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              background: colors.pale,
              color: colors.bg,
              padding: "3px 10px",
              borderRadius: 20,
              textTransform: "uppercase",
            }}
          >
            {sev}
          </span>
        </div>

        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={13} style={{ color: "var(--teal)" }} />
            ETA: {c.eta_min ?? "—"} min
          </span>
          {dist !== null && (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <MapPin size={13} style={{ color: "var(--teal)" }} />
              {dist.toFixed(1)} km
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
          <MapPin size={13} style={{ color: "var(--amber)" }} />
          Village: {village}
        </div>

        <button
          onClick={onView}
          className="notification-view-btn"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            width: "100%",
            padding: "10px 0",
            background: "var(--teal)",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 700,
            marginTop: 4,
          }}
        >
          Tap to View <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
