import React, { useState, useCallback, useMemo } from "react";
import { CheckCircle2, Loader2, Syringe, Users, Wind, Stethoscope, ShieldAlert, ChevronRight } from "lucide-react";
import * as api from "../api.js";

/**
 * PreparationPanel — hospital command workflow and antivenom inventory stats.
 *
 * Implements a 7-step linear workflow:
 * Waiting -> Accepted -> Preparing ASV -> Emergency Team Ready -> Patient Arrived -> Treatment Started -> Completed
 *
 * Also includes clinical requirements overview.
 */

const WORKFLOW_STEPS = [
  { key: "waiting", label: "Waiting" },
  { key: "accepted", label: "Accepted" },
  { key: "preparing", label: "Preparing ASV" },
  { key: "ready", label: "Team Ready" },
  { key: "arrived", label: "Patient Arrived" },
  { key: "treatment", label: "Treatment Started" },
  { key: "completed", label: "Completed" }
];

const requiredVials = (sev) => {
  const s = (sev || "").toLowerCase();
  if (s === "critical") return 15;
  if (s === "severe") return 10;
  if (s === "moderate") return 6;
  return 4;
};

const riskLevel = (sev) => {
  const s = (sev || "").toLowerCase();
  if (s === "critical" || s === "severe") return { label: "HIGH RISK", color: "var(--danger)", bg: "var(--danger-pale)" };
  if (s === "moderate") return { label: "MODERATE", color: "var(--amber)", bg: "var(--amber-pale)" };
  return { label: "LOW RISK", color: "var(--good)", bg: "var(--good-pale)" };
};

export default function PreparationPanel({ caseData, onUpdate }) {
  const [updating, setUpdating] = useState(false);

  const currentStatus = useMemo(() => {
    return caseData.status || "waiting";
  }, [caseData.status]);

  const currentIdx = useMemo(() => {
    const idx = WORKFLOW_STEPS.findIndex(s => s.key === currentStatus);
    return idx === -1 ? 0 : idx;
  }, [currentStatus]);

  const nextStep = useMemo(() => {
    if (currentIdx < WORKFLOW_STEPS.length - 1) {
      return WORKFLOW_STEPS[currentIdx + 1];
    }
    return null;
  }, [currentIdx]);

  const handleSetStatus = useCallback(async (statusKey) => {
    setUpdating(true);
    try {
      await api.sendHospitalUpdate(caseData.id, {
        type: "status_change",
        value: statusKey
      });
      if (onUpdate) onUpdate();
    } catch (e) {
      console.error("Failed to update workflow status:", e);
    } finally {
      setUpdating(false);
    }
  }, [caseData.id, onUpdate]);

  const risk = riskLevel(caseData.severity);
  const vials = requiredVials(caseData.severity);

  return (
    <div className="card glass-panel" style={{ overflow: "hidden", border: "1px solid var(--line)" }}>
      {/* Header */}
      <div style={{
        background: risk.bg,
        padding: "14px 18px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: `2px solid ${risk.color}15`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldAlert size={18} style={{ color: risk.color }} />
          <span style={{ fontWeight: 800, fontSize: 13, color: risk.color }}>
            Emergency Response Checklist
          </span>
        </div>
        <span style={{
          fontSize: 9,
          fontWeight: 900,
          color: risk.color,
          background: "#ffffffb3",
          padding: "3px 8px",
          borderRadius: 20,
        }}>
          {risk.label}
        </span>
      </div>

      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Requirements Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <ReqCard icon={<Syringe size={14} />} label="Vials Required" value={`${vials} vials`} tone="var(--teal)" />
          <ReqCard icon={<Wind size={14} />} label="ICU & Vent" value={caseData.severity === "critical" ? "Critical / Required" : "Recommended"} tone="var(--danger)" />
        </div>

        {/* Dynamic Workflow Progress */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "6px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>
            <span>WORKFLOW PROGRESSION</span>
            <span>{Math.round((currentIdx / (WORKFLOW_STEPS.length - 1)) * 100)}%</span>
          </div>

          {/* Stepper Dots */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", padding: "8px 0" }}>
            <div style={{
              position: "absolute", left: 0, right: 0, top: "50%", height: 3,
              background: "var(--line)", transform: "translateY(-50%)", zIndex: 1
            }} />
            <div style={{
              position: "absolute", left: 0, width: `${(currentIdx / (WORKFLOW_STEPS.length - 1)) * 100}%`, top: "50%", height: 3,
              background: "var(--teal)", transform: "translateY(-50%)", zIndex: 2, transition: "width 0.4s ease"
            }} />

            {WORKFLOW_STEPS.map((step, idx) => {
              const active = idx <= currentIdx;
              const isCurrent = idx === currentIdx;
              return (
                <button
                  key={step.key}
                  onClick={() => handleSetStatus(step.key)}
                  disabled={updating}
                  style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: isCurrent ? "#fff" : active ? "var(--teal)" : "#fff",
                    border: isCurrent ? "3px solid var(--teal)" : active ? "none" : "2px solid var(--line)",
                    display: "grid", placeItems: "center", zIndex: 3, cursor: "pointer",
                    boxShadow: isCurrent ? "0 0 0 3px rgba(13, 110, 110, 0.2)" : "none"
                  }}
                  title={step.label}
                >
                  {active && !isCurrent && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                  {isCurrent && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--teal)" }} />}
                </button>
              );
            })}
          </div>

          {/* Current Step Title */}
          <div style={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: "var(--teal-dark)" }}>
            Current Status: {WORKFLOW_STEPS[currentIdx].label}
          </div>
        </div>

        {/* Action Button */}
        {nextStep && (
          <button
            onClick={() => handleSetStatus(nextStep.key)}
            disabled={updating}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              width: "100%", padding: "12px", background: "var(--teal)", color: "#fff",
              borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: "pointer", transition: "all 0.2s"
            }}
          >
            {updating ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <>
                Advance to: {nextStep.label} <ChevronRight size={16} />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function ReqCard({ icon, label, value, tone }) {
  return (
    <div style={{
      background: "#F2F7F6", borderRadius: 12, padding: "8px 10px",
      display: "flex", flexDirection: "column", gap: 2
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, color: tone }}>
        {icon}
        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>{label}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: tone }}>{value}</div>
    </div>
  );
}
