import React, { useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Stethoscope, ClipboardList, Clock, Activity, ShieldAlert, Building2, MapPin, CheckSquare, Droplets, Info } from "lucide-react";
import { C } from "../theme.js";

export default function HandoverViewer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const data = useMemo(() => {
    // Legacy full-JSON payload (older QR codes) — kept for backward compatibility.
    const raw = searchParams.get("data");
    if (raw) {
      try {
        return JSON.parse(decodeURIComponent(raw));
      } catch (e) {
        console.error("Failed to parse handover QR payload", e);
      }
    }
    // New compact payload: a few short query params keep the QR camera-scannable.
    const sev = searchParams.get("sev");
    const hosp = searchParams.get("hosp");
    const time = searchParams.get("t");
    const id = searchParams.get("id");
    if (sev || hosp || time || id) {
      return {
        compact: true,
        id: id || null,
        severity: sev || "—",
        hospital: hosp || "—",
        timeSince: time || "—",
      };
    }
    return null;
  }, [searchParams]);

  // Color mapping based on severity
  const severityColors = useMemo(() => {
    if (!data) return { text: C.muted, bg: "#EEF4F3" };
    const sev = (data.severity || "").toLowerCase();
    if (sev.includes("critical")) return { text: "#FFFFFF", bg: "#7A1C1C", border: "#5C1515" };
    if (sev.includes("severe")) return { text: "#FFFFFF", bg: C.danger, border: "#D32F2F" };
    if (sev.includes("mod")) return { text: C.dark, bg: C.amberPale, border: C.amber };
    return { text: C.dark, bg: C.goodPale, border: C.good };
  }, [data]);

  if (!data) {
    return (
      <div className="px-4 py-12 flex flex-col items-center justify-center gap-4 text-center">
        <div className="rounded-full p-4" style={{ background: C.dangerPale }}>
          <Info size={40} style={{ color: C.danger }} />
        </div>
        <h1 className="text-lg font-extrabold" style={{ color: C.dark }}>
          No Handover Data Found
        </h1>
        <p className="text-xs max-w-[280px]" style={{ color: C.muted }}>
          The scanned QR code is either invalid or missing the required clinical handover payload.
        </p>
        <button
          onClick={() => navigate("/")}
          className="rounded-xl px-6 py-2.5 text-xs font-bold text-white mt-2"
          style={{ background: C.teal }}
        >
          Return to Home
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-8 flex flex-col gap-4 bg-[#F8FBFA] min-h-screen">
      {/* Clinician Handover Header */}
      <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: "#E1EAE9" }}>
        <div className="rounded-xl p-2 bg-[#E6F2F0] shrink-0">
          <Stethoscope size={20} style={{ color: C.teal }} />
        </div>
        <div>
          <h1 className="text-sm font-black uppercase tracking-wider" style={{ color: C.dark }}>
            Clinical Handover Report
          </h1>
          <p className="text-[10px]" style={{ color: C.muted }}>
            Emergency Triage Summarized Data Payload
          </p>
        </div>
      </div>

      {/* Triage Overview Card */}
      <div
        className="rounded-2xl border p-4 bg-white shadow-sm flex flex-col gap-3.5"
        style={{ borderColor: "#E1EAE9" }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
            Triage Level
          </span>
          <span
            className="text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-full border"
            style={{
              background: severityColors.bg,
              color: severityColors.text,
              borderColor: severityColors.border || severityColors.bg
            }}
          >
            {data.severity}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t pt-3" style={{ borderColor: "#F2F7F6" }}>
          <div>
            <div className="text-[10px] flex items-center gap-1 font-bold uppercase tracking-wider" style={{ color: C.muted }}>
              <Clock size={11} style={{ color: C.teal }} />
              Time Since Bite
            </div>
            <div className="text-sm font-extrabold mt-0.5" style={{ color: C.dark }}>
              {data.timeSince}
            </div>
          </div>
          <div>
            <div className="text-[10px] flex items-center gap-1 font-bold uppercase tracking-wider" style={{ color: C.muted }}>
              <ShieldAlert size={11} style={{ color: C.teal }} />
              Suspected Snake
            </div>
            <div className="text-sm font-extrabold mt-0.5 truncate" style={{ color: C.dark }}>
              {data.snake || "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Compact-payload note: the QR carries a summary; full detail is on the
          responder's device (or fetched by case id from storage/backend). */}
      {data.compact && (
        <div className="rounded-2xl border p-3.5 bg-white shadow-sm flex items-start gap-2" style={{ borderColor: "#E1EAE9" }}>
          <Info size={15} style={{ color: C.teal }} className="shrink-0 mt-0.5" />
          <div className="text-xs leading-snug" style={{ color: C.muted }}>
            Summary handover. Full clinical detail stays on the responder's device.
            {data.id && (
              <span className="block mt-1 font-bold" style={{ color: C.dark }}>
                Case ID: <span className="tabular-nums">{data.id}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Patient Identifiers (only when the payload carries them) */}
      {(data.patientId || data.patientAge || data.patientGender) && (
        <div className="rounded-2xl border p-4 bg-white shadow-sm flex flex-col gap-3" style={{ borderColor: "#E1EAE9" }}>
          <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: C.muted }}>
            <ClipboardList size={13} style={{ color: C.teal }} />
            Patient Information
          </span>
          <div className="grid grid-cols-3 gap-2 text-center text-xs mt-1">
            <div className="bg-[#F8FBFA] p-2 rounded-xl border" style={{ borderColor: "#E6EFEE" }}>
              <div className="text-[9px] font-bold" style={{ color: C.muted }}>ID</div>
              <div className="font-extrabold truncate mt-0.5" style={{ color: C.dark }}>{data.patientId || "—"}</div>
            </div>
            <div className="bg-[#F8FBFA] p-2 rounded-xl border" style={{ borderColor: "#E6EFEE" }}>
              <div className="text-[9px] font-bold" style={{ color: C.muted }}>Age</div>
              <div className="font-extrabold mt-0.5" style={{ color: C.dark }}>{data.patientAge || "—"}</div>
            </div>
            <div className="bg-[#F8FBFA] p-2 rounded-xl border" style={{ borderColor: "#E6EFEE" }}>
              <div className="text-[9px] font-bold" style={{ color: C.muted }}>Gender</div>
              <div className="font-extrabold mt-0.5" style={{ color: C.dark }}>{data.patientGender || "—"}</div>
            </div>
          </div>
        </div>
      )}

      {/* Recommended Preparation (only when the payload carries directives) */}
      {data.treatment?.length > 0 && (
        <div className="rounded-2xl border p-4 bg-white shadow-sm flex flex-col gap-3" style={{ borderColor: "#E1EAE9" }}>
          <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: C.muted }}>
            <Droplets size={13} style={{ color: C.orange }} />
            Clinical Directives & Prep
          </span>

          <div className="flex flex-col gap-2 mt-1">
            {data.treatment.map((step, i) => (
              <div key={i} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: C.dark }}>
                <span className="mt-1.5 rounded-full shrink-0" style={{ width: 6, height: 6, background: C.teal }} />
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Symptoms Profile (only when the payload carries them) */}
      {Array.isArray(data.symptoms) && (
        <div className="rounded-2xl border p-4 bg-white shadow-sm flex flex-col gap-3" style={{ borderColor: "#E1EAE9" }}>
          <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: C.muted }}>
            <Activity size={13} style={{ color: C.teal }} />
            Reported Symptoms
          </span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {data.symptoms.length > 0 ? (
              data.symptoms.map((s, i) => (
                <span
                  key={i}
                  className="text-xs font-semibold rounded-full px-2.5 py-1 border"
                  style={{ background: "#F5FAF9", color: C.teal, borderColor: C.teal + "33" }}
                >
                  {s}
                </span>
              ))
            ) : (
              <span className="text-xs" style={{ color: C.muted }}>No systemic symptoms recorded.</span>
            )}
          </div>
        </div>
      )}

      {/* Dispatch Logistics */}
      <div className="rounded-2xl border p-4 bg-white shadow-sm flex flex-col gap-3.5" style={{ borderColor: "#E1EAE9" }}>
        <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: C.muted }}>
          <Building2 size={13} style={{ color: C.teal }} />
          Dispatch & Transport Logistics
        </span>

        <div className="flex flex-col gap-2.5 text-xs border-t pt-2.5" style={{ borderColor: "#F2F7F6" }}>
          <div className="flex justify-between">
            <span style={{ color: C.muted }}>Hospital Destination</span>
            <span className="font-bold text-right" style={{ color: C.dark }}>{data.hospital || "—"}</span>
          </div>
          {data.gps && (
            <div className="flex justify-between">
              <span style={{ color: C.muted }}>GPS Coordinates</span>
              <span className="font-bold tabular-nums" style={{ color: C.dark }}>{data.gps}</span>
            </div>
          )}
          {data.biteTime && (
            <div className="flex justify-between">
              <span style={{ color: C.muted }}>Reported Bite Time</span>
              <span className="font-bold" style={{ color: C.dark }}>{data.biteTime}</span>
            </div>
          )}
        </div>
      </div>

      {/* First Aid Administered (only when the payload carries the list) */}
      {data.firstAid?.length > 0 && (
        <div className="rounded-2xl border p-4 bg-white shadow-sm flex flex-col gap-3" style={{ borderColor: "#E1EAE9" }}>
          <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: C.muted }}>
            <CheckSquare size={13} style={{ color: C.good }} />
            First Aid Administered
          </span>

          <div className="flex flex-col gap-2 mt-1">
            {data.firstAid.map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: C.dark }}>
                <span className="mt-1.5 rounded-full shrink-0" style={{ width: 6, height: 6, background: C.good }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
