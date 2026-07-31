import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  Activity, Timer, Clock, MapPin, Inbox, Loader2, RefreshCw, CheckCircle2,
  AlertOctagon, Plus, Send, AlertTriangle, ShieldCheck, Heart, User, FlameKindling, Info, Play, Square, Syringe, Users, Wind, MonitorDot
} from "lucide-react";
import { useRealtimeData } from "../RealtimeContext.jsx";
import { useAuth } from "../auth.jsx";
import PatientDrawer from "../components/PatientDrawer.jsx";
import PreparationPanel from "../components/PreparationPanel.jsx";
import MessageComposer from "../components/MessageComposer.jsx";

const WORKFLOW_STEPS = [
  { key: "waiting", label: "Waiting" },
  { key: "accepted", label: "Accepted" },
  { key: "preparing", label: "Preparing ASV" },
  { key: "ready", label: "Team Ready" },
  { key: "arrived", label: "Patient Arrived" },
  { key: "treatment", label: "Treatment Started" },
  { key: "completed", label: "Completed" }
];

export default function Cases() {
  const { cases, connectionStatus, refreshCases, isSimulating, simStep, triggerDemoSimulation, stopSimulation, newCaseAlert, dismissNewCaseAlert, playAlarm, audioUnlocked } = useRealtimeData();
  const { user } = useAuth();
  const [selectedCase, setSelectedCase] = useState(null);

  // Auto-dismiss new case alert after 8 seconds
  useEffect(() => {
    if (!newCaseAlert) return;
    const t = setTimeout(() => dismissNewCaseAlert(), 8000);
    return () => clearTimeout(t);
  }, [newCaseAlert, dismissNewCaseAlert]);

  // Filter keys
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      if (!c) return false;
      const s = String(c.severity || "severe").toLowerCase();
      const st = String(c.status || "waiting").toLowerCase();
      const matchesSeverity = severityFilter === "all" || s === severityFilter;
      const matchesStatus = statusFilter === "all" || st === statusFilter;
      return matchesSeverity && matchesStatus;
    });
  }, [cases, severityFilter, statusFilter]);

  // Operational command overview stats
  const stats = useMemo(() => {
    const total = cases.length;
    const critical = cases.filter(c => c.severity === "critical" || c.severity === "severe").length;
    const stable = cases.filter(c => c.severity === "mild" || c.severity === "moderate").length;
    const active = cases.filter(c => c.status !== "completed").length;
    const enroute = cases.filter(c => c.status === "accepted" || c.status === "enroute" || c.status === "preparing" || c.status === "ready").length;
    const responseTime = total > 0 ? "11.2 min" : "—";
    const onlineHospitals = "6 Online";

    return { total, critical, stable, active, enroute, responseTime, onlineHospitals };
  }, [cases]);

  // Selected case state tracking
  const activeSelectedCase = useMemo(() => {
    if (!selectedCase) return null;
    return cases.find(c => c.id === selectedCase.id) || selectedCase;
  }, [cases, selectedCase]);

  // Calculate live readiness score (0-100) dynamically
  const readiness = useMemo(() => {
    // Current signed-in hospital metrics simulation
    const vialsCount = 28; 
    const icuAvailable = true;
    const activeCriticalLoad = cases.filter(c => c.severity === "critical" && c.status !== "completed").length;
    
    let score = 0;
    // Vials (up to 30 pts)
    score += Math.min(30, vialsCount * 1.2);
    // ICU capacity (up to 20 pts)
    if (icuAvailable) score += 20;
    // Active load (up to 20 pts)
    score += Math.max(0, 20 - (activeCriticalLoad * 8));
    // Simulated doctor/vent (up to 30 pts)
    score += 30;

    score = Math.round(score);
    let state = "🟢 Ready";
    let color = "var(--good)";
    if (score < 60) {
      state = "🔴 Critical";
      color = "var(--danger)";
    } else if (score < 90) {
      state = "🟡 Busy";
      color = "var(--amber)";
    }

    return { score, state, color };
  }, [cases]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>



      {/* ⚠️ NEW CASE ALERT TOAST — fires whenever victim confirms alert */}
      {newCaseAlert && (
        <div
          className="new-case-toast"
          style={{
            background: "linear-gradient(135deg, #c0392b 0%, #e74c3c 100%)",
            color: "#fff",
            borderRadius: 18,
            padding: "18px 22px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            boxShadow: "0 8px 32px rgba(192,57,43,0.45)",
            animation: "toastSlideIn 0.35s cubic-bezier(.22,1,.36,1)",
            position: "sticky",
            top: 16,
            zIndex: 999,
          }}
        >
          <style>{`
            @keyframes toastSlideIn { from { opacity:0; transform:translateY(-18px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
            @keyframes toastPulse { 0%,100%{box-shadow:0 8px 32px rgba(192,57,43,.45)} 50%{box-shadow:0 8px 48px rgba(192,57,43,.75)} }
            .new-case-toast { animation: toastSlideIn 0.35s cubic-bezier(.22,1,.36,1), toastPulse 1.2s ease-in-out 0.35s 3; }
          `}</style>
          {/* Pulsing icon */}
          <div style={{
            width: 46, height: 46, borderRadius: "50%", background: "rgba(255,255,255,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            fontSize: 24,
          }}>
            🚨
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 16, letterSpacing: "-0.3px" }}>
              NEW EMERGENCY ALERT — {(newCaseAlert.case.severity || "Unknown").toUpperCase()}
            </div>
            <div style={{ fontSize: 13, opacity: 0.88, marginTop: 3, fontWeight: 600 }}>
              {newCaseAlert.case.assigned_hospital || newCaseAlert.case.assigned_hospital_id || "Unknown Hospital"}
              {newCaseAlert.case.eta_min ? ` · ETA ${newCaseAlert.case.eta_min} min` : ""}
              {newCaseAlert.case.species ? ` · ${newCaseAlert.case.species}` : ""}
              {newCaseAlert.case.id ? ` · ${newCaseAlert.case.id}` : ""}
            </div>
          </div>
          <button
            onClick={dismissNewCaseAlert}
            style={{
              background: "rgba(255,255,255,0.18)", border: "none", color: "#fff",
              borderRadius: 10, padding: "6px 14px", fontWeight: 800, fontSize: 13,
              cursor: "pointer", flexShrink: 0,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Title Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900, color: "var(--dark)", letterSpacing: "-0.8px" }}>
            Emergency Command Terminal
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--muted)", fontWeight: 650 }}>
            Incident telemetry routing, real-time patient status checklists, and resource capacity logs.
          </p>
        </div>
        
        {/* Hackathon Demo Simulator Controls */}
        <div style={{ display: "flex", gap: 10 }}>
          {isSimulating ? (
            <button
              onClick={stopSimulation}
              className="sim-btn-override demo-btn-override"
              style={{
                display: "flex", alignItems: "center", gap: 8, color: "#fff",
                background: "var(--danger)", padding: "10px 18px", borderRadius: 14, fontWeight: 800, fontSize: 13
              }}
            >
              <Square size={14} fill="#fff" /> Stop Simulation
            </button>
          ) : (
            <button
              onClick={triggerDemoSimulation}
              className="sim-btn-override demo-btn-override"
              style={{
                display: "flex", alignItems: "center", gap: 8, color: "#fff",
                background: "var(--teal)", padding: "10px 18px", borderRadius: 14, fontWeight: 800, fontSize: 13,
                boxShadow: "0 4px 14px rgba(13,110,110,0.3)"
              }}
            >
              <Play size={14} fill="#fff" /> Start 90s Hackathon Demo
            </button>
          )}
          <button
            onClick={refreshCases}
            style={{
              display: "flex", alignItems: "center", gap: 8, color: "var(--teal)",
              background: "var(--teal-pale)", border: "1px solid rgba(13,110,110,0.15)",
              padding: "10px 18px", borderRadius: 14, fontWeight: 800, fontSize: 13
            }}
          >
            <RefreshCw size={15} /> Reload Data
          </button>

        </div>
      </div>

      {/* Simulator active HUD banner */}
      {isSimulating && (
        <div className="card glass-panel" style={{
          background: "var(--teal-pale)", border: "2px solid var(--teal-light)",
          padding: "14px 20px", display: "flex", alignItems: "center", justifyBetween: "center", gap: 12
        }}>
          <div className="pulse-live-dot" style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--teal-light)" }} />
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--teal-dark)" }}>
            SIMULATOR ACTIVE: <span style={{ fontWeight: 900 }}>{simStep}</span>
          </div>
        </div>
      )}

      {/* Command Overview Tickers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 14 }}>
        <OverviewCard label="Active Alerts" value={stats.active} icon="🚨" tone="var(--danger)" bg="var(--danger-pale)" />
        <OverviewCard label="Critical Patients" value={stats.critical} icon="🔴" tone="#C0392B" bg="#fdf2f2" />
        <OverviewCard label="Ambulance Enroute" value={stats.enroute} icon="🚑" tone="var(--orange)" bg="var(--orange-pale)" />
        <OverviewCard label="AI Readiness Score" value={`${readiness.score}/100`} icon="🧠" tone={readiness.color} bg="var(--good-pale)" />
        <OverviewCard label="Avg Response Time" value={stats.responseTime} icon="⏱" tone="var(--teal)" bg="var(--teal-pale)" />
        <OverviewCard label="Registry Registry" value={stats.onlineHospitals} icon="📍" tone="var(--teal-light)" bg="#f4fbfb" />
      </div>

      {/* 2-Column Command Workspace Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "2.4fr 1fr", gap: 20, alignItems: "start" }}>
        
        {/* Left Column: Live Emergency Feed */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card glass-panel" style={{ padding: "14px 20px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", border: "1px solid var(--line)" }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: "var(--muted)", textTransform: "uppercase" }}>Filter Control:</span>
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="premium-select" style={{ width: "auto", height: 36, padding: "0 10px", borderRadius: 8, fontSize: 13 }}>
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="severe">Severe</option>
              <option value="moderate">Moderate</option>
              <option value="mild">Mild</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="premium-select" style={{ width: "auto", height: 36, padding: "0 10px", borderRadius: 8, fontSize: 13 }}>
              <option value="all">All Status Steps</option>
              {WORKFLOW_STEPS.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

          {filteredCases.length === 0 ? (
            <div className="card" style={{ padding: 60, textAlign: "center", color: "var(--muted)", border: "1px solid var(--line)" }}>
              <Inbox size={48} style={{ color: "var(--teal-light)", marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--dark)" }}>No active dispatches matched</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {filteredCases.map((c) => (
                <CaseCard key={c.id} c={c} onClick={() => setSelectedCase(c)} />
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Emergency Resource Monitor Dashboard */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card glass-panel" style={{ padding: "20px", border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <MonitorDot size={18} style={{ color: "var(--teal)" }} />
              <span style={{ fontWeight: 900, fontSize: 14, color: "var(--dark)", letterSpacing: "-0.2px" }}>Resource Telemetry</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <ResourceProgress label="Antivenom stock" value={28} max={50} unit="vials" />
              <ResourceProgress label="ICU Beds Available" value={4} max={10} unit="beds" />
              <ResourceProgress label="Trauma Ventilators" value={3} max={5} unit="devices" />
              <ResourceProgress label="On-duty Doctors" value={2} max={3} unit="physicians" />
              <ResourceProgress label="Active Nurses" value={8} max={12} unit="nurses" />
              <ResourceProgress label="Operation Theatres" value={1} max={2} unit="rooms" />
            </div>

            <div style={{
              background: "var(--good-pale)", color: "var(--good)",
              borderRadius: 12, padding: "10px 12px", marginTop: 16,
              fontSize: 11, fontWeight: 800, textAlign: "center"
            }}>
              ✓ SYSTEM STATUS: STABLE & CRITICAL CAPACITY NORMAL
            </div>
          </div>
        </div>

      </div>

      {/* Side Command Panel */}
      {activeSelectedCase && (
        <PatientDrawer
          caseData={activeSelectedCase}
          onClose={() => setSelectedCase(null)}
          onSendUpdate={refreshCases}
        />
      )}
    </div>
  );
}

// Subcomponent: Live Count-down Case card
function CaseCard({ c, onClick }) {
  const isUrgent = c.severity === "critical" || c.severity === "severe";
  const [secs, setSecs] = useState((c.eta_min ?? 12) * 60);

  useEffect(() => {
    if (c.status === "arrived" || c.status === "treatment" || c.status === "completed") {
      setSecs(0);
      return;
    }
    const timer = setInterval(() => {
      setSecs(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [c.eta_min, c.status]);

  const fmtMMSS = (val) => {
    if (val <= 0) return "Arrived";
    const m = Math.floor(val / 60);
    const s = val % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  const progressPct = useMemo(() => {
    const currentIdx = WORKFLOW_STEPS.findIndex(s => s.key === c.status) || 0;
    return Math.round((currentIdx / (WORKFLOW_STEPS.length - 1)) * 100);
  }, [c.status]);

  return (
    <div
      onClick={onClick}
      className={`card card-hover ${isUrgent && c.status !== "completed" ? "urgent-card" : ""}`}
      style={{
        border: isUrgent && c.status !== "completed" ? "2px solid var(--danger)" : "1px solid var(--line)",
        borderRadius: 20, cursor: "pointer", display: "flex", flexDirection: "column", overflow: "hidden"
      }}
    >
      <div style={{
        background: isUrgent ? "linear-gradient(90deg, #be3226, #c0392b)" : "var(--teal)",
        color: "#fff", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 900 }}>EMERGENCY ID: {c.id}</span>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 900, background: "rgba(255,255,255,0.22)",
          padding: "3px 10px", borderRadius: 20
        }}>{c.severity.toUpperCase()}</span>
      </div>

      <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        {/* Left Side Metadata */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <RowDetail label="Patient Name" value={c.patient_name || c.id} />
          <RowDetail label="Snake Species" value={`${c.species || "Unidentified"} (${c.confidence ? Math.round(c.confidence * 100) : 90}%)`} />
          <RowDetail label="Alert Origin" value={`${c.village || "Kandlakoya"} (${c.gps || "—"})`} />
          
          <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
            <div>
              <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Estimated Treatment Start</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--teal)" }}>
                {secs > 0 ? `+ ${Math.round(secs / 60) + 4} min` : "Preparing"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Antivenom Infusion</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--orange)" }}>
                {secs > 0 ? `+ ${Math.round(secs / 60) + 8} min` : "Administering"}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side Live Clock Tickers */}
        <div style={{ display: "flex", flexDirection: "column", justify: "space-between", alignItems: "flex-end", borderLeft: "1px dashed var(--line)", paddingLeft: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700 }}>AMBULANCE ETA</div>
            <div className="pulse-live-dot" style={{ fontSize: 18, fontWeight: 900, color: "var(--danger)", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Clock size={16} /> {fmtMMSS(secs)}
            </div>
          </div>

          <div style={{ width: "100%", marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 700, color: "var(--muted)" }}>
              <span>Route Progress</span>
              <span>{progressPct}%</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "#ecefef", overflow: "hidden", marginTop: 2 }}>
              <div className="bar-grow" style={{ height: "100%", width: `${progressPct}%`, background: isUrgent ? "var(--danger)" : "var(--teal)", borderRadius: 2 }} />
            </div>
          </div>

          <div style={{ fontSize: 9, fontWeight: 800, color: "var(--teal)", background: "var(--teal-pale)", padding: "3px 8px", borderRadius: 8, marginTop: 8, textTransform: "uppercase" }}>
            {c.status || "WAITING"}
          </div>
        </div>
      </div>
    </div>
  );
}

function RowDetail({ label, value }) {
  return (
    <div style={{ display: "flex", justify: "space-between", fontSize: 12 }}>
      <span style={{ color: "var(--muted)", fontWeight: 650 }}>{label}:</span>
      <span style={{ fontWeight: 800, color: "var(--dark)" }}>{value}</span>
    </div>
  );
}

function ResourceProgress({ label, value, max, unit }) {
  const pct = Math.round((value / max) * 100);
  const color = pct < 20 ? "var(--danger)" : pct < 50 ? "var(--amber)" : "var(--good)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyBetween: "space-between", fontSize: 11, fontWeight: 750 }}>
        <span style={{ color: "var(--dark)", textTransform: "capitalize" }}>{label}</span>
        <span style={{ color: color }}>{value}/{max} {unit}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "#ecefef", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

function OverviewCard({ label, value, icon, tone, bg }) {
  return (
    <div className="card card-hover" style={{ padding: "16px 14px", background: bg, border: "1px solid var(--line)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: tone }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase" }}>TELEMETRY</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, color: tone, margin: "8px 0 2px" }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>{label}</div>
    </div>
  );
}
