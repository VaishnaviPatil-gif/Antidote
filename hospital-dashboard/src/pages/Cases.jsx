import React, { useEffect, useState, useCallback } from "react";
import { Loader2, Clock, MapPin, Activity, Timer, Droplets, RefreshCw, Inbox, Check, CheckCircle2, ChevronRight, AlertTriangle } from "lucide-react";
import * as api from "../api.js";
import { C, SEVERITY_TONE } from "../theme.js";

const requiredVials = (sev) => {
  const s = (sev || "").toLowerCase();
  if (s === "critical") return 15;
  if (s === "severe") return 10;
  if (s === "moderate") return 6;
  return 4;
};

const STATUS_CONFIG = {
  preparing: { label: "Preparing Staff", tone: "var(--amber)", bg: "var(--amber-pale)" },
  enroute: { label: "En Route", tone: "var(--teal)", bg: "var(--teal-pale)" },
  arrived: { label: "Arrived / Admitted", tone: "var(--good)", bg: "var(--good-pale)" },
};

export default function Cases() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);

  // Filters
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.fetchCases();
      setCases(data.cases || []);
      setError("");
    } catch (e) {
      if (!silent) setError(e.message || "Could not load cases");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Live auto-refresh every 4s so new app requests arrive automatically.
  useEffect(() => {
    load(false);
    const id = setInterval(() => load(true), 4000);
    return () => clearInterval(id);
  }, [load]);

  const changeStatus = async (caseItem, newStatus) => {
    setUpdatingId(caseItem.id);
    setError("");
    try {
      // API expects camelCase or snake_case matching CaseSubmit model:
      // id, severity, species, confidence, gps, eta_min, assigned_hospital_id, assigned_hospital, mins_since_bite, status
      await api.updateCase({
        id: caseItem.id,
        severity: caseItem.severity,
        species: caseItem.species,
        confidence: caseItem.confidence,
        gps: caseItem.gps,
        eta_min: caseItem.eta_min,
        assigned_hospital_id: caseItem.assigned_hospital_id,
        assigned_hospital: caseItem.assigned_hospital,
        mins_since_bite: caseItem.mins_since_bite,
        status: newStatus,
      });
      // Update local state immediately
      setCases((prev) =>
        prev.map((c) => (c.id === caseItem.id ? { ...c, status: newStatus } : c))
      );
    } catch (e) {
      setError(e.message || "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  };

  // Filter logic
  const filteredCases = cases.filter((c) => {
    const matchesSeverity = severityFilter === "all" || c.severity.toLowerCase() === severityFilter;
    const matchesStatus = statusFilter === "all" || c.status.toLowerCase() === statusFilter;
    return matchesSeverity && matchesStatus;
  });

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "50vh", color: "var(--teal)" }}>
        <Loader2 size={36} className="spin" />
      </div>
    );
  }

  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header Row */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: 16
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "var(--dark)", display: "flex", alignItems: "center", gap: 10, letterSpacing: "-0.5px" }}>
            Incoming Patients
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              fontWeight: 800,
              color: "var(--good)",
              background: "var(--good-pale)",
              padding: "4px 10px",
              borderRadius: 20,
              boxShadow: "0 2px 6px rgba(26, 136, 86, 0.05)"
            }}>
              <span className="pulse-live-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--good)", display: "inline-block" }} />
              LIVE FEED
            </span>
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--muted)", fontWeight: 500 }}>
            Real-time emergency updates. Prepare antivenom inventory and critical care units before arrival.
          </p>
        </div>
        <button
          onClick={() => load(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--teal)",
            background: "var(--teal-pale)",
            border: "1px solid rgba(13, 110, 110, 0.1)",
            padding: "10px 18px",
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 14,
            boxShadow: "var(--shadow-sm)",
          }}
          className="card-hover"
        >
          <RefreshCw size={15} /> Refresh list
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="card" style={{ padding: "14px 20px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginRight: 8 }}>Filter Cases:</span>
        <select
          className="premium-select"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          style={{ width: "auto", height: 38, padding: "0 10px", borderRadius: 8, fontSize: 13 }}
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="severe">Severe</option>
          <option value="moderate">Moderate</option>
          <option value="mild">Mild</option>
        </select>

        <select
          className="premium-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: "auto", height: 38, padding: "0 10px", borderRadius: 8, fontSize: 13 }}
        >
          <option value="all">All Statuses</option>
          <option value="preparing">Preparing Staff</option>
          <option value="enroute">En Route</option>
          <option value="arrived">Arrived</option>
        </select>
      </div>

      {error && (
        <div style={{
          background: "var(--danger-pale)",
          color: "var(--danger)",
          padding: "12px 16px",
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 600,
          border: "1px solid rgba(190, 50, 38, 0.12)"
        }}>
          {error}
        </div>
      )}

      {/* Patients Display Grid */}
      {filteredCases.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: "center", color: "var(--muted)" }}>
          <Inbox size={42} style={{ color: "var(--teal-light)", marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 700 }}>No patients currently routed to your facility.</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>New cases will auto-populate here immediately upon routing.</div>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: 20
        }}>
          {filteredCases.map((c) => {
            const isCritical = c.severity === "critical" || c.severity === "severe";
            const toneColor = SEVERITY_TONE[c.severity] || "var(--teal)";
            const statusConfig = STATUS_CONFIG[c.status] || STATUS_CONFIG.preparing;
            const prepVials = requiredVials(c.severity);
            const isArrived = c.status === "arrived";

            return (
              <div
                key={c.id}
                className={`card card-hover ${isCritical && !isArrived ? 'pulse-alert-card' : ''}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  borderColor: isCritical && !isArrived ? toneColor : "var(--line)",
                  borderWidth: isCritical && !isArrived ? 2 : 1,
                  overflow: "hidden",
                  boxShadow: isCritical && !isArrived ? "0 8px 30px rgba(192, 57, 43, 0.15)" : "var(--shadow-sm)"
                }}
              >
                {/* Threat Banner */}
                <div style={{
                  background: isCritical && !isArrived ? `linear-gradient(90deg, ${toneColor}, #e74c3c)` : toneColor,
                  color: "#fff",
                  padding: "12px 18px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "0.5px" }}>
                    🚨 CASE {c.id}
                  </span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 900,
                    background: "rgba(255, 255, 255, 0.22)",
                    padding: "3px 10px",
                    borderRadius: 20,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}>
                    {c.severity}
                  </span>
                </div>

                {/* Details list */}
                <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, flexGrow: 1 }}>
                  <Row icon={<Activity size={15} />} label="Suspected Snake" value={`${c.species || "Unknown"}${c.confidence ? ` (${Math.round(c.confidence * 100)}%)` : ""}`} />
                  <Row icon={<Clock size={15} />} label="Time Since Bite" value={`${c.mins_since_bite || "—"} mins ago`} danger={c.mins_since_bite > 30} />
                  <Row icon={<Timer size={15} />} label="Estimated ETA" value={isArrived ? "Admitted" : `${c.eta_min ?? "—"} mins`} tone={!isArrived && toneColor} />
                  
                  {/* ETA progress visualization */}
                  {!isArrived && typeof c.eta_min === "number" && (
                    <div style={{ height: 6, borderRadius: 3, background: "#ecefef", overflow: "hidden", marginTop: -4 }}>
                      <div className="bar-grow" style={{
                        height: "100%",
                        width: `${Math.max(10, 100 - (c.eta_min * 2.5))}%`,
                        background: toneColor,
                        borderRadius: 3
                      }} />
                    </div>
                  )}

                  <Row icon={<Droplets size={15} />} label="Antivenom Recommendation" value={`${prepVials} vials`} tone={toneColor} />
                  <Row icon={<MapPin size={15} />} label="Patient Location" value={c.gps || "—"} mono />

                  {/* Divider */}
                  <div style={{ borderTop: "1px solid var(--line)", margin: "4px 0" }} />

                  {/* Actions / Status Section */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: statusConfig.tone,
                      background: statusConfig.bg,
                      padding: "4px 10px",
                      borderRadius: 20
                    }}>
                      {statusConfig.label.toUpperCase()}
                    </span>

                    {/* Status Toggles for staff workflow */}
                    {updatingId === c.id ? (
                      <Loader2 size={18} className="spin" style={{ color: "var(--teal)" }} />
                    ) : (
                      <div style={{ display: "flex", gap: 6 }}>
                        {c.status === "preparing" && (
                          <button
                            onClick={() => changeStatus(c, "enroute")}
                            style={statusActionBtn}
                            title="Mark En Route"
                            className="card-hover"
                          >
                            Dispatch <ChevronRight size={14} style={{ marginLeft: 2 }} />
                          </button>
                        )}
                        {(c.status === "preparing" || c.status === "enroute") && (
                          <button
                            onClick={() => changeStatus(c, "arrived")}
                            style={{ ...statusActionBtn, background: "var(--good-pale)", color: "var(--good)" }}
                            title="Confirm Arrival"
                            className="card-hover"
                          >
                            <Check size={14} style={{ marginRight: 2 }} /> Arrived
                          </button>
                        )}
                        {isArrived && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--good)", display: "flex", alignItems: "center", gap: 4 }}>
                            <CheckCircle2 size={14} /> Ready
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, value, tone, danger, mono }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
      <span className="row" style={{ gap: 6, fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
        <span style={{ color: "var(--teal-light)" }}>{icon}</span>{label}
      </span>
      <span
        className="truncate"
        style={{
          fontWeight: 700,
          fontSize: 13,
          color: tone || (danger ? "var(--danger)" : "var(--dark)"),
          fontFamily: mono ? "monospace" : "inherit"
        }}
      >
        {value}
      </span>
    </div>
  );
}

const statusActionBtn = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--teal)",
  background: "var(--teal-pale)",
  padding: "6px 12px",
  borderRadius: 8,
  display: "flex",
  alignItems: "center",
  boxShadow: "var(--shadow-sm)"
};
