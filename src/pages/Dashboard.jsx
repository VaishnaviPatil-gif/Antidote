import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft, Clock, Activity, MapPin, AlertTriangle, CheckCircle2,
  Boxes, ShieldCheck, Timer, Stethoscope
} from "lucide-react";
import { C, FRAME_BG, SEVERITY_TONE, SEVERITY_PALE } from "../theme.js";
import { tFor } from "../i18n.js";
import { useEmergency, minutesSinceBite } from "../context/EmergencyContext.jsx";
import { requiredVialsFor, DEMO_RECOMMENDED } from "../lib/handover.js";
import { MOCK_INCOMING_CASES } from "../lib/hospitals.js";

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    language,
    biteTime,
    severity,
    snake,
    victimLocation,
    recommendedHospital,
    patientId
  } = useEmergency();

  const t = tFor(language);

  // Live time ticker for all countdowns and time-since-bite computations
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Filter states
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Status state for the live emergency case (persisted locally)
  const [liveStatus, setLiveStatus] = useState(
    () => localStorage.getItem("dashboard.live.status") || "preparing"
  );
  useEffect(() => {
    localStorage.setItem("dashboard.live.status", liveStatus);
  }, [liveStatus]);

  // Initialized mock cases with target times anchored relative to page load time
  const [mockCases, setMockCases] = useState(() =>
    MOCK_INCOMING_CASES.map(c => ({
      ...c,
      biteTime: new Date(Date.now() - (c.id === "P-882-901" ? 25 : c.id === "P-112-402" ? 10 : 95) * 60000),
      targetTime: new Date(Date.now() + (c.id === "P-882-901" ? (5 * 60 + 34) * 1000 : c.id === "P-112-402" ? 10 * 60000 : -80 * 60000)),
      assignedHospital: c.assignedHospitalName
    }))
  );

  // Consolidate live case from EmergencyContext (if a bite has been logged)
  const liveCase = useMemo(() => {
    if (!biteTime) return null;
    const hosp = recommendedHospital || DEMO_RECOMMENDED;
    const etaMin = hosp.eta || 25;
    return {
      id: patientId || "P-LIVE-099",
      biteTime: new Date(biteTime),
      severity,
      species: snake?.species || "Unidentified",
      confidence: snake?.confidence || 0,
      gps: victimLocation
        ? `${victimLocation.lat.toFixed(4)}, ${victimLocation.lng.toFixed(4)}`
        : "Pending GPS",
      eta: etaMin,
      assignedHospital: hosp.name,
      targetTime: new Date(new Date(biteTime).getTime() + etaMin * 60000),
      status: liveStatus,
      isLive: true
    };
  }, [biteTime, recommendedHospital, patientId, severity, snake, victimLocation, liveStatus]);

  // Combine and sort cases: live case first, then mock cases
  const allCases = useMemo(() => {
    const list = [];
    if (liveCase) list.push(liveCase);
    list.push(...mockCases);
    return list;
  }, [liveCase, mockCases]);

  // Update status handler
  const handleUpdateStatus = (id, nextStatus) => {
    if (liveCase && id === liveCase.id) {
      setLiveStatus(nextStatus);
    } else {
      setMockCases(prev =>
        prev.map(c => (c.id === id ? { ...c, status: nextStatus } : c))
      );
    }
  };

  // Filter list
  const filteredCases = useMemo(() => {
    return allCases.filter(c => {
      const matchSev = filterSeverity === "all" || c.severity === filterSeverity;
      const matchStat = filterStatus === "all" || c.status === filterStatus;
      return matchSev && matchStat;
    });
  }, [allCases, filterSeverity, filterStatus]);

  // Compute countdown timer text
  const getCountdown = (targetTime, status) => {
    if (status === "arrived" || status === "started") {
      return { text: t.dashboard.arrived, isLate: false };
    }
    const diffMs = targetTime.getTime() - now.getTime();
    if (diffMs <= 0) {
      return { text: t.dashboard.late, isLate: true };
    }
    const totalSecs = Math.floor(diffMs / 1000);
    const mm = Math.floor(totalSecs / 60).toString().padStart(2, "0");
    const ss = (totalSecs % 60).toString().padStart(2, "0");
    return { text: `${mm}:${ss}`, isLate: false };
  };

  return (
    <div className="px-4 pt-4 pb-8 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          aria-label={t.common?.back || "Back"}
          className="rounded-lg p-1.5 shrink-0 active:scale-95 transition-transform"
          style={{ background: C.tealPale }}
        >
          <ChevronLeft size={18} style={{ color: C.teal }} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold leading-tight" style={{ color: C.dark }}>
            {t.dashboard.title}
          </h1>
          <p className="text-xs leading-snug" style={{ color: C.muted }}>
            {t.dashboard.subtitle}
          </p>
        </div>
      </div>

      {/* ── Analytics redirect banner ── */}
      <button
        onClick={() => navigate("/analytics")}
        className="w-full rounded-xl border flex items-center justify-between px-3 py-2.5 text-xs font-bold active:scale-[.99] transition-transform"
        style={{ borderColor: "#C5DBD9", color: C.teal, background: C.tealPale }}
      >
        <span className="flex items-center gap-1.5">
          <Activity size={14} style={{ color: C.teal }} />
          {t.analytics.title}
        </span>
        <ChevronRight size={14} style={{ color: C.teal }} />
      </button>

      {/* Filter Controls */}
      <div className="rounded-2xl border p-3 flex flex-col gap-3 bg-white" style={{ borderColor: "#E1EAE9" }}>
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>
          {t.dashboard.filters}
        </div>
        
        {/* Severity Filters */}
        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>
            {t.dashboard.severity}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["all", "severe", "moderate", "mild"].map(sev => (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                className="text-xs font-bold rounded-full px-3 py-1.5 border capitalize active:scale-95 transition-transform"
                style={{
                  background: filterSeverity === sev ? C.teal : "#fff",
                  color: filterSeverity === sev ? "#fff" : C.tealDark,
                  borderColor: filterSeverity === sev ? C.teal : "#D7E3E2"
                }}
              >
                {sev === "all" ? t.dashboard.all : t[sev]}
              </button>
            ))}
          </div>
        </div>

        {/* Status Filters */}
        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>
            {t.dashboard.status}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["all", "preparing", "enroute", "arrived", "started"].map(stat => (
              <button
                key={stat}
                onClick={() => setFilterStatus(stat)}
                className="text-xs font-bold rounded-full px-3 py-1.5 border active:scale-95 transition-transform"
                style={{
                  background: filterStatus === stat ? C.teal : "#fff",
                  color: filterStatus === stat ? "#fff" : C.tealDark,
                  borderColor: filterStatus === stat ? C.teal : "#D7E3E2"
                }}
              >
                {stat === "all" 
                  ? t.dashboard.all 
                  : stat === "enroute"
                  ? t.dashboard.statuses.enroute
                  : t.dashboard.statuses[stat]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cases List */}
      <div className="flex flex-col gap-4">
        {filteredCases.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-8 px-4 text-center text-sm" style={{ borderColor: "#C5DBD9", color: C.muted }}>
            {t.dashboard.noCases}
          </div>
        ) : (
          filteredCases.map(c => {
            const tone = SEVERITY_TONE[c.severity];
            const minsAgo = minutesSinceBite(c.biteTime, now);
            const countdownInfo = getCountdown(c.targetTime, c.status);
            const vials = requiredVialsFor(c.severity);

            return (
              <div
                key={c.id}
                className="rounded-2xl overflow-hidden bg-white border flex flex-col shadow-sm transition-all"
                style={{
                  borderColor: c.isLive ? tone : "#E1EAE9",
                  boxShadow: c.isLive ? `0 6px 18px ${tone}12` : "none",
                  borderWidth: c.isLive ? "2px" : "1px"
                }}
              >
                {/* Case Header */}
                <div
                  className="px-4 py-2.5 flex items-center justify-between text-white"
                  style={{ background: c.isLive ? tone : C.teal }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-black tracking-wider uppercase truncate">
                      {c.isLive ? `🚨 Live: ${c.id}` : c.id}
                    </span>
                  </div>
                  <span
                    className="text-[10px] font-black rounded-full px-2 py-0.5 shrink-0 uppercase tracking-wide"
                    style={{ background: "rgba(255, 255, 255, 0.2)" }}
                  >
                    {t[c.severity]}
                  </span>
                </div>

                {/* Case Details */}
                <div className="p-4 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {/* Bite Time */}
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                        {t.dashboard.biteTime}
                      </span>
                      <span className="font-semibold leading-snug" style={{ color: C.dark }}>
                        {c.biteTime.toLocaleTimeString(language === "en" ? "en-US" : "en-IN", { hour: "numeric", minute: "2-digit" })}
                        <span className="text-[10px] font-medium ml-1 text-red-600">
                          ({minsAgo}m {t.sinceBite})
                        </span>
                      </span>
                    </div>

                    {/* Vials Dose */}
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                        {t.dashboard.dose}
                      </span>
                      <span className="font-bold flex items-center gap-1" style={{ color: tone }}>
                        <Boxes size={12} />
                        {t.dashboard.vialsVal(vials)}
                      </span>
                    </div>

                    {/* Snake Identification */}
                    <div className="flex flex-col col-span-2 border-t pt-2" style={{ borderColor: "#F2F7F6" }}>
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                        {t.dashboard.snakeReport}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <AlertTriangle size={13} style={{ color: c.species !== "Unidentified" ? C.teal : C.danger }} />
                        <span className="font-bold truncate" style={{ color: C.dark }}>
                          {c.species}
                          {c.confidence > 0 && (
                            <span className="text-[10px] font-medium ml-1.5" style={{ color: C.muted }}>
                              ({Math.round(c.confidence * 100)}%)
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Assigned Hospital */}
                    <div className="flex flex-col col-span-2 border-t pt-2" style={{ borderColor: "#F2F7F6" }}>
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                        {t.dashboard.hospital}
                      </span>
                      <span className="font-semibold truncate mt-0.5" style={{ color: C.dark }}>
                        {c.assignedHospital}
                      </span>
                    </div>

                    {/* GPS Coordinates */}
                    <div className="flex flex-col col-span-2 border-t pt-2" style={{ borderColor: "#F2F7F6" }}>
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                        {t.dashboard.location}
                      </span>
                      <span className="font-medium font-mono text-[11px] truncate flex items-center gap-1 mt-0.5" style={{ color: C.tealDark }}>
                        <MapPin size={11} style={{ color: C.tealLight }} />
                        {c.gps}
                      </span>
                    </div>
                  </div>

                  {/* Countdown Timer Block */}
                  {(c.status === "preparing" || c.status === "enroute") && (
                    <div
                      className="rounded-xl p-3 flex items-center justify-between mt-1 border"
                      style={{
                        background: countdownInfo.isLate ? "#FDF3F2" : "#F2F7F6",
                        borderColor: countdownInfo.isLate ? "#F0CFC9" : "#E1EAE9"
                      }}
                    >
                      <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: countdownInfo.isLate ? C.danger : C.tealDark }}>
                        <Timer size={14} className={c.status === "enroute" ? "ap-spin" : ""} style={{ color: countdownInfo.isLate ? C.danger : C.teal }} />
                        {t.dashboard.countdown}
                      </span>
                      <span className="text-sm font-black tracking-wide font-mono leading-none" style={{ color: countdownInfo.isLate ? C.danger : C.dark }}>
                        {countdownInfo.text}
                      </span>
                    </div>
                  )}

                  {/* Status Triage Controls */}
                  <div className="border-t pt-3 mt-1 flex flex-col gap-2" style={{ borderColor: "#F2F7F6" }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                      {t.dashboard.status}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { key: "preparing", text: t.dashboard.statuses.preparing, color: C.amber, bg: C.amberPale },
                        { key: "enroute", text: t.dashboard.statuses.enroute, color: C.teal, bg: C.tealPale },
                        { key: "arrived", text: t.dashboard.statuses.arrived, color: C.good, bg: C.goodPale },
                        { key: "started", text: t.dashboard.statuses.started, color: "#8E24AA", bg: "#F3E5F5" }
                      ].map(btn => {
                        const active = c.status === btn.key;
                        return (
                          <button
                            key={btn.key}
                            onClick={() => handleUpdateStatus(c.id, btn.key)}
                            className="rounded-lg py-2 px-1 text-[11px] font-extrabold transition-all border leading-tight active:scale-95"
                            style={{
                              borderColor: active ? btn.color : "#E1EAE9",
                              background: active ? btn.bg : "#fff",
                              color: active ? btn.color : C.muted
                            }}
                          >
                            {btn.text}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
