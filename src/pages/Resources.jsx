import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Truck, UserCheck, ShieldAlert, Building2, Bell, Heart, Phone, Clock } from "lucide-react";
import { C } from "../theme.js";
import { tFor } from "../i18n.js";
import { useEmergency } from "../context/EmergencyContext.jsx";
import { startCall } from "../lib/share.js";

export default function Resources() {
  const navigate = useNavigate();
  const { language } = useEmergency();
  const t = tFor(language);

  // Status definitions & timelines
  const ambulanceStages = ["dispatched", "enroute", "arrivedLoc", "transporting", "arrivedHosp"];
  const ashaStages = ["notified", "enroute", "arrivedLoc", "firstAid", "handover"];
  const policeStages = ["alerted", "routeSecured", "clearance"];
  const hospitalStages = ["prepIcu", "asvPrep", "triageAssembled", "readyToReceive"];

  // Active status indices (starts midway for realistic seed state)
  const [ambIndex, setAmbIndex] = useState(1); // enroute
  const [ashaIndex, setAshaIndex] = useState(2); // arrivedLoc
  const [policeIndex, setPoliceIndex] = useState(1); // routeSecured
  const [hospIndex, setHospIndex] = useState(1); // asvPrep

  // Timeline events logs list
  const [logs, setLogs] = useState(() => {
    const now = Date.now();
    return [
      { id: "1", time: new Date(now - 12 * 60000), resource: "police", msg: "alerted" },
      { id: "2", time: new Date(now - 10 * 60000), resource: "asha", msg: "notified" },
      { id: "3", time: new Date(now - 8 * 60000), resource: "ambulance", msg: "dispatched" },
      { id: "4", time: new Date(now - 6 * 60000), resource: "police", msg: "routeSecured" },
      { id: "5", time: new Date(now - 4 * 60000), resource: "hospital", msg: "prepIcu" },
      { id: "6", time: new Date(now - 3 * 60000), resource: "asha", msg: "enroute" },
      { id: "7", time: new Date(now - 2 * 60000), resource: "asha", msg: "arrivedLoc" },
      { id: "8", time: new Date(now - 1 * 60000), resource: "hospital", msg: "asvPrep" },
    ];
  });

  // Telemetry simulation - auto advance statuses sequentially
  useEffect(() => {
    const interval = setInterval(() => {
      const roll = Math.floor(Math.random() * 4); // Pick one resource to advance
      const nowTime = new Date();

      if (roll === 0 && ambIndex < ambulanceStages.length - 1) {
        const nextIdx = ambIndex + 1;
        setAmbIndex(nextIdx);
        setLogs(prev => [
          { id: String(Date.now()), time: nowTime, resource: "ambulance", msg: ambulanceStages[nextIdx] },
          ...prev
        ]);
      } else if (roll === 1 && ashaIndex < ashaStages.length - 1) {
        const nextIdx = ashaIndex + 1;
        setAshaIndex(nextIdx);
        setLogs(prev => [
          { id: String(Date.now()), time: nowTime, resource: "asha", msg: ashaStages[nextIdx] },
          ...prev
        ]);
      } else if (roll === 2 && policeIndex < policeStages.length - 1) {
        const nextIdx = policeIndex + 1;
        setPoliceIndex(nextIdx);
        setLogs(prev => [
          { id: String(Date.now()), time: nowTime, resource: "police", msg: policeStages[nextIdx] },
          ...prev
        ]);
      } else if (roll === 3 && hospIndex < hospitalStages.length - 1) {
        const nextIdx = hospIndex + 1;
        setHospIndex(nextIdx);
        setLogs(prev => [
          { id: String(Date.now()), time: nowTime, resource: "hospital", msg: hospitalStages[nextIdx] },
          ...prev
        ]);
      }
    }, 12000); // simulation interval

    return () => clearInterval(interval);
  }, [ambIndex, ashaIndex, policeIndex, hospIndex]);

  // Dynamic values
  const currentAmbStatus = ambulanceStages[ambIndex];
  const currentAshaStatus = ashaStages[ashaIndex];
  const currentPoliceStatus = policeStages[policeIndex];
  const currentHospStatus = hospitalStages[hospIndex];

  const responders = [
    {
      id: "ambulance",
      title: t.resources.ambulance,
      icon: <Truck size={20} style={{ color: C.teal }} />,
      name: "Vikarabad 108 Dispatch Unit 3",
      meta: "Vehicle No: TS-13-UA-1829",
      operator: "Ramesh Kumar (EMT Driver)",
      phone: "+91 98480 22338",
      statusKey: currentAmbStatus,
      progress: ((ambIndex + 1) / ambulanceStages.length) * 100,
      eta: ambIndex === 1 ? "14 min" : ambIndex === 3 ? "8 min" : "—",
      color: C.teal
    },
    {
      id: "asha",
      title: t.resources.asha,
      icon: <UserCheck size={20} style={{ color: C.good }} />,
      name: "Sunitha Gowd (Community ASHA)",
      meta: "Marpally Region Primary Care",
      operator: "Dispatched with emergency kit",
      phone: "+91 94401 22910",
      statusKey: currentAshaStatus,
      progress: ((ashaIndex + 1) / ashaStages.length) * 100,
      eta: ashaIndex < 2 ? "2 min" : "Arrived",
      color: C.good
    },
    {
      id: "police",
      title: t.resources.police,
      icon: <ShieldAlert size={20} style={{ color: C.danger }} />,
      name: "Highway Patrol Unit 4",
      meta: "Sub-Inspector K. Raghavendra",
      operator: "Clearing transport corridors",
      phone: "+91 90102 33412",
      statusKey: currentPoliceStatus,
      progress: ((policeIndex + 1) / policeStages.length) * 100,
      eta: "Route Clear",
      color: C.danger
    },
    {
      id: "hospital",
      title: t.resources.hospital,
      icon: <Building2 size={20} style={{ color: C.orange }} />,
      name: "District Hospital Vikarabad",
      meta: "ICU Bed 3 Reserved • 30 ASV Vials",
      operator: "Duty Officer: Dr. Sandeep",
      phone: "+91 84122 23344",
      statusKey: currentHospStatus,
      progress: ((hospIndex + 1) / hospitalStages.length) * 100,
      eta: "Ready",
      color: C.orange
    }
  ];

  return (
    <div className="px-4 pt-4 pb-8 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          aria-label={t.resources.back}
          className="rounded-lg p-1.5 shrink-0 active:scale-95 transition-transform"
          style={{ background: C.tealPale }}
        >
          <ChevronLeft size={18} style={{ color: C.teal }} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold leading-tight" style={{ color: C.dark }}>
            {t.resources.title}
          </h1>
          <p className="text-xs leading-snug" style={{ color: C.muted }}>
            {t.resources.subtitle}
          </p>
        </div>
      </div>

      {/* Telemetry Status Indicator */}
      <div className="rounded-xl border p-2.5 flex items-center justify-between" style={{ borderColor: C.good + "33", background: C.goodPale }}>
        <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: C.good }}>
          <span className="w-2 h-2 rounded-full animate-ping" style={{ background: C.good }} />
          {t.resources.telemetryConnected}
        </span>
        <span className="text-[10px] font-semibold" style={{ color: C.muted }}>
          {t.resources.autoUpdateStatus}
        </span>
      </div>

      {/* Responder Cards */}
      <div className="flex flex-col gap-3.5">
        {responders.map(r => (
          <div key={r.id} className="rounded-2xl border p-4 bg-white flex flex-col gap-3 shadow-sm" style={{ borderColor: "#E1EAE9" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl p-2 shrink-0" style={{ background: `${r.color}15` }}>
                  {r.icon}
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                    {r.title}
                  </div>
                  <div className="text-sm font-extrabold leading-tight" style={{ color: C.dark }}>
                    {r.name}
                  </div>
                </div>
              </div>

              {/* Call button */}
              <button
                onClick={() => startCall(r.phone)}
                className="rounded-xl px-2.5 py-1.5 text-xs font-bold flex items-center gap-1 active:scale-95 transition-transform"
                style={{ background: C.tealPale, color: C.teal }}
              >
                <Phone size={13} />
                {t.resources.call}
              </button>
            </div>

            {/* Operator and Metadata details */}
            <div className="text-[11px] leading-snug border-t pt-2.5" style={{ borderColor: "#F2F7F6" }}>
              <div className="font-extrabold" style={{ color: C.dark }}>
                {r.operator}
              </div>
              <div style={{ color: C.muted }}>
                {r.meta}
              </div>
            </div>

            {/* Progress bar and active status */}
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex justify-between items-baseline text-xs">
                <span className="font-extrabold" style={{ color: r.color }}>
                  {t.resources.statuses[r.statusKey] || r.statusKey}
                </span>
                <span className="font-semibold text-[10px]" style={{ color: C.muted }}>
                  {t.resources.eta}: {r.eta}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#EDF3F2] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${r.progress}%`, background: r.color }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chronological Timeline Log */}
      <div className="rounded-2xl border p-4 bg-white flex flex-col gap-3" style={{ borderColor: "#E1EAE9" }}>
        <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: C.muted }}>
          <Bell size={14} style={{ color: C.teal }} />
          {t.resources.liveTimeline}
        </span>
        
        <div className="flex flex-col gap-3 mt-1.5">
          {logs.slice(0, 6).map((log, index) => {
            const timeStr = log.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            const rInfo = responders.find(r => r.id === log.resource) || {};

            return (
              <div key={log.id} className="flex gap-2.5 text-xs animate-fade-in">
                <span className="font-extrabold tabular-nums whitespace-nowrap" style={{ color: C.muted }}>
                  {timeStr}
                </span>
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: rInfo.color || C.teal }} />
                <div className="min-w-0">
                  <span className="font-bold" style={{ color: C.dark }}>
                    {rInfo.title}:{" "}
                  </span>
                  <span style={{ color: C.muted }}>
                    {t.resources.statuses[log.msg] || log.msg}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
