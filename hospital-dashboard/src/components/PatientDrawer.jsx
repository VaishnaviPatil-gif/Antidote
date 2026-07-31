import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  X, User, Activity, MapPin, Clock, Shield, FileText,
  Heart, Navigation, Phone, AlertTriangle, CheckCircle2,
  Zap, Mic, Brain, Building2, Timer, ChevronDown, ChevronUp,
  MapPinCheck, MessageSquare, ClipboardList, PlusCircle, RotateCcw, Play, Pause, Stethoscope
} from "lucide-react";
import QRCode from "qrcode";
import DashboardMap from "./DashboardMap.jsx";
import * as api from "../api.js";

const SEV_COLORS = {
  critical: "var(--danger)",
  severe:   "var(--danger)",
  moderate: "var(--amber)",
  mild:     "var(--good)",
};

const WORKFLOW_ORDER = [
  "waiting", "accepted", "preparing", "ready", "arrived", "treatment", "completed"
];

export default function PatientDrawer({ caseData, onClose, onSendUpdate }) {
  const [qrUrl, setQrUrl] = useState(null);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [notesText, setNotesText] = useState("");
  const [notesList, setNotesList] = useState([]);
  const [savingNote, setSavingNote] = useState(false);
  const [activeTab, setActiveTab] = useState("handover"); // handover | detailed | checklist
  
  // Timeline Playback state
  const [playbackIdx, setPlaybackIdx] = useState(-1);

  const overlayRef = useRef(null);
  const c = caseData;

  // Initialize notes
  useEffect(() => {
    if (c && c.updates) {
      const existingNotes = c.updates.filter(u => u.type === "note" || u.type === "message");
      setNotesList(existingNotes);
    }
  }, [c]);

  // Generate QR code
  useEffect(() => {
    if (!c) return;
    const qrPayload = c.qr_data || JSON.stringify({
      id: c.id,
      severity: c.severity,
      species: c.species,
      gps: c.gps,
      hospital: c.assigned_hospital,
      eta: c.eta_min,
      ts: c.created_at,
    });
    QRCode.toDataURL(qrPayload, {
      width: 140,
      margin: 1,
      color: { dark: "#0A4F4F", light: "#FFFFFF" },
    }).then(setQrUrl).catch(() => setQrUrl(null));
  }, [c]);

  const loc = useMemo(() => {
    if (!c) return null;
    if (c.last_location && typeof c.last_location.lat === "number" && typeof c.last_location.lng === "number") {
      return c.last_location;
    }
    if (c.gps) {
      const parts = c.gps.split(",").map((s) => parseFloat(s.trim()));
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return { lat: parts[0], lng: parts[1] };
      }
    }
    return null;
  }, [c]);

  // 5. Patient Risk Engine calculation
  const riskMetrics = useMemo(() => {
    if (!c) return { score: 0, label: "LOW", color: "var(--good)", angle: -90 };
    let score = 20; // base score
    const sev = (c.severity || "").toLowerCase();
    if (sev === "critical") score += 40;
    else if (sev === "severe") score += 30;
    else if (sev === "moderate") score += 15;

    const mins = c.mins_since_bite || 15;
    if (mins > 45) score += 25;
    else if (mins > 30) score += 15;
    else if (mins > 15) score += 5;

    if (c.species && c.species !== "Unidentified") {
      score += 15;
    }

    if (c.symptoms) {
      const spreadingCount = Object.values(c.symptoms).filter(v => v === "spreading" || v === "yes").length;
      score += spreadingCount * 6;
    }

    score = Math.min(100, score);
    let label = "LOW";
    let color = "var(--good)";
    if (score > 80) {
      label = "CRITICAL";
      color = "var(--danger)";
    } else if (score > 60) {
      label = "HIGH";
      color = "var(--orange)";
    } else if (score > 30) {
      label = "MODERATE";
      color = "var(--amber)";
    }

    // Map 0-100 score to -90 to 90 degrees needle rotation angle
    const angle = -90 + (score / 100) * 180;
    return { score, label, color, angle };
  }, [c]);

  if (!c) return null;

  const sevColor = SEV_COLORS[(c.severity || "").toLowerCase()] || "var(--teal)";
  const originalTimeline = c.timeline || [];
  const prep = c.preparation || {};

  // Timeline Playback slice
  const timeline = useMemo(() => {
    if (playbackIdx === -1) return originalTimeline;
    return originalTimeline.slice(0, playbackIdx + 1);
  }, [originalTimeline, playbackIdx]);

  const handleSaveNote = async () => {
    if (!notesText.trim()) return;
    setSavingNote(true);
    try {
      await api.sendHospitalUpdate(c.id, {
        type: "note",
        message: notesText.trim(),
      });
      const newNote = {
        type: "note",
        message: notesText.trim(),
        from: "hospital",
        ts: Date.now() / 1000
      };
      setNotesList(prev => [...prev, newNote]);
      setNotesText("");
      if (onSendUpdate) onSendUpdate();
    } catch (e) {
      console.error("Failed to save note:", e);
    } finally {
      setSavingNote(false);
    }
  };

  const currentStatus = playbackIdx === -1 ? (c.status || "waiting") : WORKFLOW_ORDER[Math.min(playbackIdx, WORKFLOW_ORDER.length - 1)];

  return (
    <>
      <div
        ref={overlayRef}
        className="drawer-overlay"
        onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      />

      <div className="patient-drawer glass-panel" style={{ width: "600px", maxWidth: "95vw" }}>
        {/* Header */}
        <div className="drawer-header" style={{ borderBottom: `4px solid ${sevColor}`, background: "rgba(255, 255, 255, 0.85)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: sevColor, display: "grid", placeItems: "center", color: "#fff",
              boxShadow: `0 4px 14px ${sevColor}44`
            }}>
              <Stethoscope size={22} className="pulse-live-dot" />
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18, color: "var(--dark)", letterSpacing: "-0.5px" }}>
                COMMAND BOARD: {c.id}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: sevColor, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {c.severity} · {c.species || "Unidentified Snake"}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ color: "var(--muted)", background: "rgba(0,0,0,0.05)", border: "none", padding: 8, borderRadius: "50%" }}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Controls */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--line)", background: "#f8f9fa", padding: "0 20px" }}>
          <TabButton active={activeTab === "handover"} onClick={() => setActiveTab("handover")} label="15s Handover" />
          <TabButton active={activeTab === "detailed"} onClick={() => setActiveTab("detailed")} label="AI Diagnostics" />
          <TabButton active={activeTab === "checklist"} onClick={() => setActiveTab("checklist")} label="Clinical Checklist" />
        </div>

        {/* Scrollable Command Center */}
        <div className="drawer-body" style={{ padding: "20px 24px" }}>
          
          {/* TAB 1: 15-SECOND CLINICAL DIGEST */}
          {activeTab === "handover" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              
              {/* V4 Patient Risk Engine (Animated SVG Gauge) */}
              <div className="card glass-panel" style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, color: "var(--muted)", textTransform: "uppercase" }}>
                    AI Clinical Risk Evaluator
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: riskMetrics.color, margin: "6px 0 2px" }}>
                    {riskMetrics.label} ({riskMetrics.score}/100)
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 650 }}>
                    Based on severity index, bite delay, and symptom spread.
                  </div>
                </div>

                {/* SVG Dial Gauge */}
                <div style={{ width: 140, height: 80, position: "relative", display: "grid", placeItems: "center" }}>
                  <svg width="120" height="70" viewBox="0 0 100 55" style={{ overflow: "visible" }}>
                    <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#ecefef" strokeWidth="10" strokeLinecap="round" />
                    <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={riskMetrics.color} strokeWidth="10" strokeLinecap="round"
                          strokeDasharray={`${(riskMetrics.score / 100) * 125} 125`} />
                    {/* Needle */}
                    <g transform={`translate(50,50) rotate(${riskMetrics.angle})`}>
                      <line x1="0" y1="0" x2="0" y2="-42" stroke="var(--dark)" strokeWidth="3" strokeLinecap="round" />
                      <circle cx="0" cy="0" r="5" fill="var(--dark)" />
                    </g>
                  </svg>
                </div>
              </div>

              {/* 6. AI Clinical Brief (Under 20-Second Triage Reading) */}
              <div className="card" style={{ padding: 18, borderLeft: `5px solid ${riskMetrics.color}` }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: riskMetrics.color, textTransform: "uppercase", marginBottom: 12 }}>
                  📋 AI Clinical Brief (Triage P1 - Actionable under 20s)
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12, lineHeight: 1.4 }}>
                  <div>
                    <span style={{ color: "var(--muted)", fontWeight: 700 }}>Diagnosis:</span>
                    <div style={{ fontWeight: 800, color: "var(--dark)" }}>Venomous {c.species || "Cobra"} Bite</div>
                  </div>
                  <div>
                    <span style={{ color: "var(--muted)", fontWeight: 700 }}>Vitals:</span>
                    <div style={{ fontWeight: 800, color: "var(--dark)" }}>HR 94, BP 110/70, RR 18/min</div>
                  </div>
                  <div>
                    <span style={{ color: "var(--muted)", fontWeight: 700 }}>Treatment Priority:</span>
                    <div style={{ fontWeight: 800, color: riskMetrics.color }}>IMMEDIATE INTERVENTION (P1)</div>
                  </div>
                  <div>
                    <span style={{ color: "var(--muted)", fontWeight: 700 }}>Timeline:</span>
                    <div style={{ fontWeight: 800, color: "var(--dark)" }}>{c.mins_since_bite || 15}m post-bite, ETA {c.eta_min || 12}m</div>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span style={{ color: "var(--muted)", fontWeight: 700 }}>ASV Recommendation:</span>
                    <div style={{ fontWeight: 800, color: "var(--teal)" }}>10 Vials IV immediately over 1 hour</div>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span style={{ color: "var(--muted)", fontWeight: 700 }}>ICU & Ventilation:</span>
                    <div style={{ fontWeight: 800, color: "var(--dark)" }}>Standby ventilator. Admit to clinical ICU block on arrival.</div>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span style={{ color: "var(--muted)", fontWeight: 700 }}>Monitoring Notes:</span>
                    <div style={{ fontWeight: 800, color: "var(--dark)", fontStyle: "italic" }}>
                      Watch SpO2, perform Whole Blood Clotting Test (20WBCT) every 30 minutes.
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Treatment suggestions */}
              <Section icon={<Brain size={16} />} title="AI Detailed Directives">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <SuggestionRow title="Likely Venom Class" value={c.venom_type || "Neurotoxic / Hemotoxic systemic envenomation"} />
                  <SuggestionRow title="Expected Complications" value="Respiratory paralysis, renal injury, local swelling necrosis" />
                  <SuggestionRow title="Required Specialists" value="Toxicologist, Intensivist, Nephrologist" />
                </div>
              </Section>

              {/* QR pass & Ambulance details */}
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
                <div className="card" style={{ padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Navigation size={14} style={{ color: "var(--teal)" }} />
                    <span style={{ fontSize: 11, fontWeight: 900, color: "var(--dark)" }}>Ambulance telemetry</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                    <div><span style={{ color: "var(--muted)" }}>Speed:</span> <b>45 km/h</b></div>
                    <div><span style={{ color: "var(--muted)" }}>Driver:</span> <b>Ravi Kumar (+91 90000 88888)</b></div>
                    <div><span style={{ color: "var(--muted)" }}>ETA Countdown:</span> <b>{c.status === "arrived" ? "Arrived" : `${c.eta_min ?? "—"} min`}</b></div>
                  </div>
                </div>

                <div className="card" style={{ padding: 10, display: "flex", flexDirection: "column", alignItems: "center", justify: "center" }}>
                  {qrUrl && <img src={qrUrl} alt="Handover QR" style={{ width: 100, height: 100 }} />}
                  <span style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, marginTop: 4 }}>Gate Pass QR Code</span>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: DETAILED DIAGNOSTICS */}
          {activeTab === "detailed" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Telemetry Driving Map */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Navigation size={16} style={{ color: "var(--teal)" }} />
                  <span style={{ fontWeight: 800, fontSize: 14, color: "var(--dark)" }}>Driving Route Telemetry</span>
                </div>
                <DashboardMap victimLoc={loc} hospitalId={c.assigned_hospital_id} />
              </div>

              {/* Voice transcripts */}
              {c.voice_transcript && (
                <Section icon={<Mic size={16} />} title="Voice Incident Logs">
                  <div style={{
                    background: "#f0f4f4", borderLeft: "4px solid var(--teal)",
                    padding: "12px 14px", borderRadius: "0 12px 12px 0",
                    fontSize: 13, fontStyle: "italic", color: "var(--dark)", lineHeight: 1.4
                  }}>
                    "{c.voice_transcript}"
                  </div>
                </Section>
              )}

              {/* General details */}
              <Section icon={<User size={16} />} title="Patient Information">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <InfoRow label="Patient ID" value={c.id} />
                  <InfoRow label="Name" value={c.patient_name || c.id} />
                  <InfoRow label="Age" value={c.patient_age || "24"} />
                  <InfoRow label="Gender" value={c.patient_gender || "Male"} />
                </div>
              </Section>
            </div>
          )}

          {/* TAB 3: CLINICAL CHECKLIST & WORKFLOW PLAYBACK */}
          {activeTab === "checklist" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              
              {/* Live preparation workflow control */}
              <PreparationPanel caseData={c} onUpdate={onSendUpdate} />

              <MessageComposer caseId={c.id} sentMessages={notesList} />

              {/* 8. Complete Timeline Playback controls */}
              <Section icon={<Clock size={16} />} title="Emergency Timeline & Playback">
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8f9fa", padding: 10, borderRadius: 10, marginBottom: 12 }}>
                  <button
                    onClick={() => { setPlaybackIdx(prev => (prev > -1 ? prev - 1 : -1)); }}
                    style={{ padding: 6, background: "#fff", border: "1px solid var(--line)", borderRadius: 8 }}
                    title="Previous step"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)", flex: 1, textAlign: "center" }}>
                    Playback status: {currentStatus.toUpperCase()}
                  </span>
                  <button
                    onClick={() => { setPlaybackIdx(prev => (prev < originalTimeline.length - 1 ? prev + 1 : -1)); }}
                    style={{ padding: 6, background: "var(--teal)", color: "#fff", border: "none", borderRadius: 8, fontSize: 11, fontWeight: 700 }}
                  >
                    Next Step
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column" }}>
                  {timeline.map((ev, idx) => {
                    const isLast = idx === timeline.length - 1;
                    return (
                      <div key={idx} style={{ display: "flex", gap: 14 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 16 }}>
                          <div style={{
                            width: 10, height: 10, borderRadius: "50%",
                            background: ev.source === "hospital" ? "var(--teal)" : ev.source === "victim" ? "var(--orange)" : "var(--muted)",
                            border: "2px solid #fff", boxShadow: "0 0 0 2px var(--line)",
                            flexShrink: 0
                          }} />
                          {!isLast && <div style={{ width: 2, flexGrow: 1, background: "var(--line)", margin: "4px 0" }} />}
                        </div>
                        <div style={{ paddingBottom: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--dark)" }}>{ev.event}</div>
                          <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 600 }}>
                            {ev.ts ? new Date(ev.ts).toLocaleTimeString() : "—"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

function Section({ icon, title, children }) {
  return (
    <div className="drawer-section" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 16, paddingTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ color: "var(--teal)" }}>{icon}</span>
        <span style={{ fontWeight: 900, fontSize: 14, color: "var(--dark)" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "14px 16px",
        fontWeight: 800,
        fontSize: 13,
        color: active ? "var(--teal)" : "var(--muted)",
        borderBottom: active ? "3px solid var(--teal)" : "3px solid transparent",
        transition: "all 0.2s"
      }}
    >
      {label}
    </button>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f8f9fa" }}>
      <span style={{ fontSize: 12, fontWeight: 650, color: "var(--muted)" }}>{label}:</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--dark)" }}>{value}</span>
    </div>
  );
}

function HandoverItem({ label, value, color, highlight }) {
  return (
    <div style={{ background: highlight ? "rgba(255,255,255,0.7)" : "#f8f9fa", padding: 8, borderRadius: 10 }}>
      <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 800, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 900, color: color || "var(--dark)", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function VitalCard({ label, value }) {
  return (
    <div style={{ background: "#F2F7F6", borderRadius: 12, padding: "10px", textAlign: "center" }}>
      <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 800, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 900, color: "var(--dark)", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function SuggestionRow({ title, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 8px", background: "#f8f9fa", borderRadius: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>{title}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--dark)" }}>{value}</div>
    </div>
  );
}
