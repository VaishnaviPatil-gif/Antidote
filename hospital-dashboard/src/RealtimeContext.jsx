import React, { createContext, useContext, useState, useRef, useCallback } from "react";
import { useRealtime } from "./useRealtime.js";
import { useAuth } from "./auth.jsx";
import * as api from "./api.js";

const RealtimeContext = createContext(null);

export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const targetHospitalId = user?.hospital_id || "admin_all";
  const realtime = useRealtime(targetHospitalId);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simStep, setSimStep] = useState("");
  const simTimer = useRef([]);

  const cleanSimTimers = () => {
    simTimer.current.forEach(t => clearTimeout(t));
    simTimer.current = [];
  };

  const speakText = (text) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    }
  };

  // Automated 90-second Hackathon Demo Simulation
  const triggerDemoSimulation = useCallback(async () => {
    if (!targetHospitalId) return;
    cleanSimTimers();
    setIsSimulating(true);
    setSimStep("Initiating emergency...");

    const caseId = `ANT-${Math.floor(10000 + Math.random() * 90000)}`;
    const simHospitalId = user?.hospital_id || "cmrims";

    const mockInitialCase = {
      id: caseId,
      severity: "severe",
      species: "Russell's Viper",
      confidence: 0.94,
      gps: "17.6297, 78.4813",
      eta_min: 12,
      assigned_hospital_id: simHospitalId,
      assigned_hospital: user?.name || "CMR Institute of Medical Sciences",
      mins_since_bite: 15,
      status: "waiting",
      village: "Gundlapochampally",
      patient_name: "Aditya Sharma",
      patient_age: "24",
      patient_gender: "Male",
      emergency_contact: { name: "Rajesh Sharma (Father)", phone: "+91 98480 22334" },
      voice_transcript: "I was working in the field and a brown snake bit my foot. It hurts a lot and I feel dizzy.",
      first_aid_given: ["Limb immobilized in split", "Patient kept calm and seated", "Tourniquet avoided"],
      hospital_recommendation_reason: "Selected Malla Reddy Hospital because: 26 ASV vials available, ICU free, 9 min ETA, lowest estimated treatment delay.",
      venom_type: "Neurotoxic & Hemotoxic",
      danger_level: "severe",
      symptoms: {
        bleeding_site: "no",
        vomiting: "yes",
        muscle_pain: "yes",
        drooping_eyelids: "spreading",
        swelling: "yes"
      }
    };

    try {
      // 0s: Create initial case
      await api.updateCase(mockInitialCase);
      setSimStep("0s: Bite Reported & Hospital Alerted");
      speakText("New emergency alert received. Severity critical. Patient is in Gundlapochampally village.");

      // 10s: Accepted
      simTimer.current.push(setTimeout(async () => {
        setSimStep("10s: Hospital Accepted Emergency");
        await api.sendHospitalUpdate(caseId, { type: "status_change", value: "accepted" });
        await api.sendMessage(caseId, "Emergency team is ready. Ambulance dispatched.");
        speakText("Case accepted. Dispatching ambulance immediately.");
      }, 10000));

      // 25s: Preparing ASV
      simTimer.current.push(setTimeout(async () => {
        setSimStep("25s: Preparing ASV Antivenom Vials");
        await api.sendHospitalUpdate(caseId, { type: "status_change", value: "preparing" });
        await api.sendHospitalUpdate(caseId, { type: "preparation", field: "asv_prepared", value: true });
        speakText("Anti snake venom vials are prepared and reserved in storage.");
      }, 25000));

      // 40s: Team Ready & Navigation Started
      simTimer.current.push(setTimeout(async () => {
        setSimStep("40s: Emergency Team Ready at Gate");
        await api.sendHospitalUpdate(caseId, { type: "status_change", value: "ready" });
        await api.sendHospitalUpdate(caseId, { type: "preparation", field: "team_ready", value: true });
        await api.sendMessage(caseId, "Staff assembled at main trauma gate.");
        speakText("Emergency trauma team assembled and ready at gate.");
      }, 40000));

      // 55s: Simulate ambulance coordinate updates (driving closer)
      simTimer.current.push(setTimeout(async () => {
        setSimStep("55s: Ambulance approaching hospital gate");
        const dest = { lat: 17.59620, lng: 78.48630 }; // cmrims coords
        await api.sendHospitalUpdate(caseId, {
          type: "preparation",
          field: "ambulance_approaching",
          value: true
        });
        const intermediateGps = { lat: dest.lat + 0.002, lng: dest.lng + 0.002 };
        await fetch(`${api.API_BASE}/api/cases/${caseId}/location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(intermediateGps)
        });
        speakText("Ambulance is approaching hospital entrance. Estimated remaining time, five minutes.");
      }, 55000));

      // 70s: Arrived
      simTimer.current.push(setTimeout(async () => {
        setSimStep("70s: Patient Arrived at Gate");
        await api.sendHospitalUpdate(caseId, { type: "status_change", value: "arrived" });
        await api.sendHospitalUpdate(caseId, { type: "preparation", field: "patient_received", value: true });
        await api.sendMessage(caseId, "Triage admission complete. Transitioning to ICU.");
        speakText("Patient arrived at gate. Moving to intensive care.");
      }, 70000));

      // 80s: Treatment Started
      simTimer.current.push(setTimeout(async () => {
        setSimStep("80s: Treatment Started & ASV Infused");
        await api.sendHospitalUpdate(caseId, { type: "status_change", value: "treatment" });
        speakText("Clinical treatment initiated.");
      }, 80000));

      // 90s: Completed / Case Closed
      simTimer.current.push(setTimeout(async () => {
        setSimStep("90s: Completed & Case Closed");
        await api.sendHospitalUpdate(caseId, { type: "status_change", value: "completed" });
        setIsSimulating(false);
        speakText("Emergency closed. Patient stabilized.");
      }, 90000));

    } catch (e) {
      console.error("Simulation failed:", e);
      setIsSimulating(false);
    }
  }, [targetHospitalId, user]);

  const stopSimulation = useCallback(() => {
    cleanSimTimers();
    setIsSimulating(false);
    setSimStep("");
  }, []);

  return (
    <RealtimeContext.Provider value={{
      ...realtime,
      isSimulating,
      simStep,
      triggerDemoSimulation,
      stopSimulation
    }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtimeData() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error("useRealtimeData must be used within RealtimeProvider");
  }
  return ctx;
}
