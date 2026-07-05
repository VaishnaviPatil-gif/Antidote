import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Beaker, ArrowLeft, RefreshCw, Play, Pause, Landmark, ShieldCheck, MapPin, Truck, AlertTriangle } from "lucide-react";
import { C } from "../theme.js";
import { useEmergency } from "../context/EmergencyContext.jsx";
import { idbSet } from "../lib/db.js";
import { SEED_FACILITIES } from "../lib/hospitals.js";

// Predefined route steps for GPS simulation (Jeedimetla → Malla Reddy Narayana)
const SIMULATED_GPS_STEPS = [
  { lat: 17.5105, lng: 78.4420, label: "Jeedimetla (Bite Location)" },
  { lat: 17.5200, lng: 78.4400, label: "Suraram Road (En Route)" },
  { lat: 17.5300, lng: 78.4370, label: "Jeedimetla X Roads (Passing)" },
  { lat: 17.5390, lng: 78.4350, label: "Suraram (Nearing)" },
  { lat: 17.5440, lng: 78.4334, label: "Malla Reddy Narayana (Arrived)" }
];

export default function Demo() {
  const navigate = useNavigate();
  const { 
    biteTime,
    setVictimLocation,
    patch,
    resetEmergency
  } = useEmergency();

  const [activeScenario, setActiveScenario] = useState("");
  const [gpsStepIndex, setGpsStepIndex] = useState(0);
  const [isAutoGps, setIsAutoGps] = useState(false);
  const [timelineStage, setTimelineStage] = useState("bite");
  const [vailsMarpally, setVialsMarpally] = useState(0);
  const [vialsVikarabad, setVialsVikarabad] = useState(30);

  // Auto GPS playback interval
  useEffect(() => {
    let timer;
    if (isAutoGps) {
      timer = setInterval(() => {
        setGpsStepIndex(prev => {
          const next = (prev + 1) % SIMULATED_GPS_STEPS.length;
          const step = SIMULATED_GPS_STEPS[next];
          setVictimLocation({ lat: step.lat, lng: step.lng }, step.label);
          return next;
        });
      }, 5000);
    }
    return () => clearInterval(timer);
  }, [isAutoGps, setVictimLocation]);

  // Load Cobra Severe Triage Scenario
  const loadCobraScenario = () => {
    setActiveScenario("cobra");
    const testBiteTime = new Date(Date.now() - 20 * 60000); // 20m ago
    
    // 1. Mock stock shortage in IndexedDB (Marpally 0, Vikarabad 24)
    const mockedStock = SEED_FACILITIES.map(h => {
      if (h.id === "phc-marpally") return { ...h, vials: 0 };
      if (h.id === "dh-vikarabad") return { ...h, vials: 24 };
      return h;
    });
    idbSet("antidote:hospitals", { facilities: mockedStock, updated_at: new Date().toISOString() });
    setVialsMarpally(0);
    setVialsVikarabad(24);

    // 2. Set severe symptoms & mock identification in context
    patch({
      biteTime: testBiteTime,
      snake: {
        species: "Spectacled Cobra",
        scientific: "Naja naja",
        confidence: 0.94,
        danger_level: "Highly Venomous",
        venom_type: "Neurotoxic",
        similar_snakes: ["Common Krait"],
        typical_habitat: "Agricultural fields",
        first_aid_steps: ["Keep limb immobilized", "Stay calm", "Avoid incisions"],
        validation_status: "Verified"
      },
      severity: "severe",
      symptomLog: [
        {
          t: new Date(Date.now() - 15 * 60000),
          answers: { swelling: "spreading", breathing: "yes", vision: "yes", bleeding: "no", drowsy: "no" },
          level: "severe",
          aiSeverity: {
            severity: "Severe",
            confidence: 0.94,
            reasoning: ["Spreading swelling detected.", "Neurotoxic visual symptoms present.", "Respiratory distress reported."],
            disclaimer: "Medical guidance only. Always remain safety-first."
          }
        }
      ],
      victimLocation: { lat: 17.5105, lng: 78.442 },
      victimLabel: "Jeedimetla, Hyderabad"
    });
    setGpsStepIndex(0);
    setTimelineStage("route");
    updateTimelineStamps(testBiteTime, "route");
  };

  // Load Krait Critical Scenario
  const loadKraitScenario = () => {
    setActiveScenario("krait");
    const testBiteTime = new Date(Date.now() - 10 * 60000); // 10m ago

    // Mock Vikarabad Stock to Yellow alert (2 vials) to show warnings
    const mockedStock = SEED_FACILITIES.map(h => {
      if (h.id === "dh-vikarabad") return { ...h, vials: 2 };
      return h;
    });
    idbSet("antidote:hospitals", { facilities: mockedStock, updated_at: new Date().toISOString() });
    setVialsMarpally(0);
    setVialsVikarabad(2);

    patch({
      biteTime: testBiteTime,
      snake: {
        species: "Common Krait",
        scientific: "Bungarus caeruleus",
        confidence: 0.96,
        danger_level: "Deadly Venomous",
        venom_type: "Neurotoxic",
        similar_snakes: ["Wolf Snake"],
        typical_habitat: "Rural dwellings",
        first_aid_steps: ["Immobilize limb", "Clean wound", "Fast transport"],
        validation_status: "Verified"
      },
      severity: "critical",
      symptomLog: [
        {
          t: new Date(Date.now() - 8 * 60000),
          answers: { swelling: "none", breathing: "yes", vision: "yes", bleeding: "no", drowsy: "yes" },
          level: "critical",
          aiSeverity: {
            severity: "Critical",
            confidence: 0.96,
            reasoning: ["Ptosis and severe drowsiness.", "Respiratory insufficiency emerging.", "Highly lethal neurotoxin."],
            disclaimer: "Medical guidance only. Always remain safety-first."
          }
        }
      ],
      victimLocation: { lat: 17.5623, lng: 78.4538 },
      victimLabel: "Maisammaguda, Hyderabad"
    });
    setGpsStepIndex(4);
    setTimelineStage("handover");
    updateTimelineStamps(testBiteTime, "handover");
  };

  // Set simulated timeline milestone
  const updateTimelineStamps = (bTime, stageKey) => {
    if (!bTime) return;
    const stampKey = `antidote.timeline.${new Date(bTime).getTime()}`;
    const stages = ["bite", "gps", "hospital", "route", "notified", "handover", "preparing", "enroute", "arrival"];
    const stageIndex = stages.indexOf(stageKey);
    
    const stamps = {};
    const baseTime = Date.now();
    for (let i = 0; i <= stageIndex; i++) {
      stamps[stages[i]] = new Date(baseTime - (stageIndex - i) * 60000).toISOString();
    }
    localStorage.setItem(stampKey, JSON.stringify(stamps));
    window.dispatchEvent(new Event("storage"));
  };

  // Handle manual timeline selector
  const selectTimelineStage = (stage) => {
    setTimelineStage(stage);
    updateTimelineStamps(biteTime, stage);
  };

  // Adjust hospital stock manually
  const adjustStock = (hospitalId, vials) => {
    if (hospitalId === "marpally") setVialsMarpally(vials);
    else setVialsVikarabad(vials);

    const mockedStock = SEED_FACILITIES.map(h => {
      if (hospitalId === "marpally" && h.id === "phc-marpally") return { ...h, vials };
      if (hospitalId === "vikarabad" && h.id === "dh-vikarabad") return { ...h, vials };
      return h;
    });
    idbSet("antidote:hospitals", { facilities: mockedStock, updated_at: new Date().toISOString() });
    window.dispatchEvent(new Event("storage"));
  };

  // Next GPS step manual click
  const advanceGps = () => {
    const nextIdx = (gpsStepIndex + 1) % SIMULATED_GPS_STEPS.length;
    setGpsStepIndex(nextIdx);
    const step = SIMULATED_GPS_STEPS[nextIdx];
    setVictimLocation({ lat: step.lat, lng: step.lng }, step.label);
  };

  // One-click reset
  const handleReset = () => {
    resetEmergency();
    // Delete IndexedDB hospitals cache to restore default stock
    idbSet("antidote:hospitals", { facilities: SEED_FACILITIES, updated_at: new Date().toISOString() });
    setActiveScenario("");
    setGpsStepIndex(0);
    setIsAutoGps(false);
    setTimelineStage("bite");
    setVialsMarpally(0);
    setVialsVikarabad(30);
    navigate("/");
  };

  return (
    <div className="px-4 pt-4 pb-8 flex flex-col gap-4 bg-[#F8FBFA] min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="rounded-lg p-1.5 shrink-0 active:scale-95 transition-transform"
          style={{ background: C.tealPale }}
        >
          <ArrowLeft size={18} style={{ color: C.teal }} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold leading-tight flex items-center gap-1.5" style={{ color: C.dark }}>
            <Beaker size={20} style={{ color: C.teal }} />
            Demo Control Center
          </h1>
          <p className="text-xs leading-snug" style={{ color: C.muted }}>
            Control simulation states for live presentation review
          </p>
        </div>
      </div>

      {/* Reset Panel */}
      <button
        onClick={handleReset}
        className="w-full rounded-xl text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
        style={{ background: C.danger, height: 48, fontSize: 14 }}
      >
        <RefreshCw size={16} />
        Reset Demo & Return Home
      </button>

      {/* Scenario Loader Section */}
      <div className="rounded-2xl border p-4 bg-white shadow-sm flex flex-col gap-3" style={{ borderColor: "#E1EAE9" }}>
        <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800" style={{ color: C.teal }}>
          Predefined Scenarios
        </span>

        <div className="flex flex-col gap-2.5">
          {/* Cobra Scenario */}
          <button
            onClick={loadCobraScenario}
            className="w-full rounded-xl border text-left p-3.5 flex items-start justify-between gap-3 active:scale-[0.98] transition-transform"
            style={{
              borderColor: activeScenario === "cobra" ? C.teal : "#E1EAE9",
              background: activeScenario === "cobra" ? C.tealPale : "#fff"
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold" style={{ color: C.dark }}>
                Scenario 1: Cobra Bite in Marpally
              </div>
              <div className="text-[10px] leading-relaxed mt-0.5" style={{ color: C.muted }}>
                Severe neurotoxic bite, 20m elapsed. Marpally stock is 0 (forces Vikarabad diversion routing warnings).
              </div>
            </div>
            <Play size={15} style={{ color: C.teal }} className="shrink-0 mt-1" />
          </button>

          {/* Krait Scenario */}
          <button
            onClick={loadKraitScenario}
            className="w-full rounded-xl border text-left p-3.5 flex items-start justify-between gap-3 active:scale-[0.98] transition-transform"
            style={{
              borderColor: activeScenario === "krait" ? C.teal : "#E1EAE9",
              background: activeScenario === "krait" ? C.tealPale : "#fff"
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold" style={{ color: C.dark }}>
                Scenario 2: Common Krait (Vikarabad)
              </div>
              <div className="text-[10px] leading-relaxed mt-0.5" style={{ color: C.muted }}>
                Critical neurotoxic signs, 10m elapsed. Vikarabad stock set to 2 vials (Yellow shortage alert).
              </div>
            </div>
            <Play size={15} style={{ color: C.teal }} className="shrink-0 mt-1" />
          </button>
        </div>
      </div>

      {/* GPS Simulation */}
      <div className="rounded-2xl border p-4 bg-white shadow-sm flex flex-col gap-3.5" style={{ borderColor: "#E1EAE9" }}>
        <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: C.muted }}>
          <MapPin size={14} style={{ color: C.teal }} />
          GPS Live Tracking Simulator
        </span>

        <div className="bg-[#F8FBFA] rounded-xl p-3 border text-xs" style={{ borderColor: "#E6EFEE" }}>
          <div style={{ color: C.muted }}>Current GPS Coordinate State:</div>
          <div className="font-extrabold text-sm mt-1" style={{ color: C.dark }}>
            {SIMULATED_GPS_STEPS[gpsStepIndex].lat.toFixed(4)}, {SIMULATED_GPS_STEPS[gpsStepIndex].lng.toFixed(4)}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: C.teal }}>
            {SIMULATED_GPS_STEPS[gpsStepIndex].label}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-0.5">
          <button
            onClick={advanceGps}
            className="rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
            style={{ borderColor: C.teal, color: C.teal, height: 40, background: "#fff" }}
          >
            Advance GPS Step
          </button>
          
          <button
            onClick={() => setIsAutoGps(!isAutoGps)}
            className="rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
            style={{ background: isAutoGps ? C.danger : C.teal, height: 40 }}
          >
            {isAutoGps ? <Pause size={14} /> : <Play size={14} />}
            {isAutoGps ? "Stop Auto GPS" : "Auto GPS (5s)"}
          </button>
        </div>
      </div>

      {/* Timeline Steps Simulation */}
      <div className="rounded-2xl border p-4 bg-white shadow-sm flex flex-col gap-3.5" style={{ borderColor: "#E1EAE9" }}>
        <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: C.muted }}>
          <Truck size={14} style={{ color: C.teal }} />
          Ambulance / Coordination Milestones
        </span>

        <div className="flex flex-wrap gap-2 mt-1">
          {["bite", "gps", "hospital", "route", "notified", "handover", "preparing", "enroute", "arrival"].map(stage => {
            const active = timelineStage === stage;
            return (
              <button
                key={stage}
                onClick={() => selectTimelineStage(stage)}
                className="text-xs font-bold rounded-xl px-3 py-2 border transition-all active:scale-95"
                style={{
                  background: active ? C.teal : "#fff",
                  color: active ? "#fff" : C.muted,
                  borderColor: active ? C.teal : "#E1EAE9"
                }}
              >
                {stage}
              </button>
            );
          })}
        </div>
      </div>

      {/* Hospital Stock Manual Editor */}
      <div className="rounded-2xl border p-4 bg-white shadow-sm flex flex-col gap-3" style={{ borderColor: "#E1EAE9" }}>
        <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: C.muted }}>
          <Landmark size={14} style={{ color: C.teal }} />
          Hospital Stock Telemetry Simulator
        </span>

        {/* Marpally Stock */}
        <div className="flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: "#F2F7F6" }}>
          <div className="flex justify-between items-center text-xs">
            <span className="font-extrabold" style={{ color: C.dark }}>PHC Marpally Stock</span>
            <span className="font-bold tabular-nums" style={{ color: C.muted }}>{vailsMarpally} vials</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => adjustStock("marpally", 0)}
              className="rounded-lg border text-xs font-semibold py-1.5 bg-[#FFF5F5] text-[#C53030]"
              style={{ borderColor: "#FEB2B2" }}
            >
              Set Stock to 0 (Diversion)
            </button>
            <button
              onClick={() => adjustStock("marpally", 12)}
              className="rounded-lg border text-xs font-semibold py-1.5 bg-[#F0FFF4] text-[#22543D]"
              style={{ borderColor: "#9AE6B4" }}
            >
              Set Stock to 12 (Safe)
            </button>
          </div>
        </div>

        {/* Vikarabad Stock */}
        <div className="flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: "#F2F7F6" }}>
          <div className="flex justify-between items-center text-xs">
            <span className="font-extrabold" style={{ color: C.dark }}>District Hospital Vikarabad</span>
            <span className="font-bold tabular-nums" style={{ color: C.muted }}>{vialsVikarabad} vials</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => adjustStock("vikarabad", 0)}
              className="rounded-lg border text-[10px] font-semibold py-1.5 bg-[#FFF5F5] text-[#C53030]"
              style={{ borderColor: "#FEB2B2" }}
            >
              Set 0 (Red Alert)
            </button>
            <button
              onClick={() => adjustStock("vikarabad", 2)}
              className="rounded-lg border text-[10px] font-semibold py-1.5 bg-[#FFFFF0] text-[#744210]"
              style={{ borderColor: "#FEEBC8" }}
            >
              Set 2 (Yellow Warn)
            </button>
            <button
              onClick={() => adjustStock("vikarabad", 30)}
              className="rounded-lg border text-[10px] font-semibold py-1.5 bg-[#F0FFF4] text-[#22543D]"
              style={{ borderColor: "#9AE6B4" }}
            >
              Set 30 (Safe)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
