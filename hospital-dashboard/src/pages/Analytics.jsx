import React, { useEffect, useState, useMemo } from "react";
import { Loader2, Boxes, Building2, AlertTriangle, ShieldCheck, Bed, Activity, Award } from "lucide-react";
import * as api from "../api.js";
import { C } from "../theme.js";

export default function Analytics() {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.fetchHospitals()
      .then((d) => setHospitals(d.hospitals || []))
      .catch((e) => setError(e.message || "Could not load analytics data"))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const total = hospitals.length;
    const vials = hospitals.reduce((s, h) => s + (h.vials || 0), 0);
    const stocked = hospitals.filter((h) => (h.vials || 0) > 0).length;
    const stockouts = hospitals.filter((h) => (h.vials || 0) <= 0);
    const icu = hospitals.filter((h) => h.icu).length;
    const beds = hospitals.reduce((s, h) => s + (h.beds || 0), 0);
    const maxV = Math.max(1, ...hospitals.map((h) => h.vials || 0));
    return { total, vials, stocked, stockouts, icu, beds, maxV };
  }, [hospitals]);

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "50vh", color: "var(--teal)" }}>
        <Loader2 size={36} className="spin" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div style={{
        background: "var(--danger-pale)",
        color: "var(--danger)",
        padding: "16px 20px",
        borderRadius: 12,
        fontWeight: 600,
        border: "1px solid rgba(190, 50, 38, 0.12)"
      }}>
        {error}
      </div>
    );
  }

  const readiness = stats.total ? Math.round((stats.stocked / stats.total) * 100) : 0;

  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Title Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "var(--dark)", letterSpacing: "-0.5px" }}>
          Emergency Network Analytics
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--muted)", fontWeight: 500 }}>
          Live operational status, antivenom reserves, and critical care capacity across all registered facilities.
        </p>
      </div>

      {/* KPI Stats Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 16
      }}>
        <Kpi icon={<Building2 size={22} />} value={stats.total} label="Facilities" tone="var(--teal)" bg="var(--teal-pale)" />
        <Kpi icon={<Boxes size={22} />} value={stats.vials} label="ASV Vials" tone="var(--teal)" bg="var(--teal-pale)" />
        <Kpi icon={<ShieldCheck size={22} />} value={`${readiness}%`} label="Readiness Rate" tone="var(--good)" bg="var(--good-pale)" />
        <Kpi icon={<AlertTriangle size={22} />} value={stats.stockouts.length} label="Stockouts" tone="var(--danger)" bg="var(--danger-pale)" isAlert={stats.stockouts.length > 0} />
        <Kpi icon={<Activity size={22} />} value={stats.icu} label="ICU-Capable" tone="var(--amber)" bg="var(--amber-pale)" />
        <Kpi icon={<Bed size={22} />} value={stats.beds} label="Emergency Beds" tone="var(--teal)" bg="var(--teal-pale)" />
      </div>

      {/* Main Charts & Alerts Section */}
      <div className="analytics-grid">
        {/* Vials chart */}
        <div className="card" style={{ padding: "24px 24px" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "var(--dark)", marginBottom: 20, letterSpacing: "-0.2px" }}>
            Antivenom Reserves by Facility
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {hospitals.map((h) => {
              const v = h.vials || 0;
              const pct = Math.round((v / stats.maxV) * 100);
              const color = v <= 0 ? "var(--danger)" : v < 6 ? "var(--amber)" : "var(--good)";
              const trackBg = v <= 0 ? "var(--danger-pale)" : v < 6 ? "var(--amber-pale)" : "var(--good-pale)";
              return (
                <div key={h.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="truncate" style={{ fontSize: 13, fontWeight: 700, color: "var(--dark)", maxWidth: "80%" }}>
                      {h.name}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color, display: "flex", alignItems: "center", gap: 4 }}>
                      {v} {v === 1 ? "vial" : "vials"}
                    </span>
                  </div>
                  {/* Progress bar container */}
                  <div style={{ height: 12, borderRadius: 6, background: "#ecefef", overflow: "hidden" }}>
                    <div
                      className="bar-grow"
                      style={{
                        height: "100%",
                        width: `${Math.max(pct, v > 0 ? 5 : 0)}%`,
                        background: color,
                        borderRadius: 6
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>
                    <span>{h.tier.toUpperCase()} · {h.sector === "private" ? "Private" : "Govt"}</span>
                    <span>{h.beds} beds {h.icu ? "· ICU Available" : ""}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Alerts & Critical Stock list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Alerts panel */}
          <div className="card" style={{ padding: "24px 24px" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "var(--dark)", marginBottom: 16, letterSpacing: "-0.2px" }}>
              Active Network Alerts
            </div>
            {stats.stockouts.length === 0 ? (
              <div style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                color: "var(--good)",
                background: "var(--good-pale)",
                padding: "16px 18px",
                borderRadius: 16,
                fontSize: 14,
                fontWeight: 700
              }}>
                <ShieldCheck size={20} />
                <span>Optimal ASV distribution. No active stockouts.</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {stats.stockouts.map((h) => (
                  <div
                    key={h.id}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      background: "var(--danger-pale)",
                      borderRadius: 16,
                      padding: "14px 16px",
                      border: "1px solid rgba(190, 50, 38, 0.1)"
                    }}
                  >
                    <AlertTriangle size={20} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13, color: "var(--dark)" }}>{h.name}</div>
                      <div style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600, marginTop: 2 }}>
                        STOCKOUT: 0 vials. Victims are being routed to nearby clinics.
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick recommendations */}
          <div className="card" style={{ padding: "24px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "var(--dark)", letterSpacing: "-0.2px", display: "flex", alignItems: "center", gap: 6 }}>
              <Award size={18} style={{ color: "var(--teal)" }} />
              Network Recommendations
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
              Based on live clinical indicators, the following actions are recommended for regional health managers:
            </p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "var(--dark)", display: "flex", flexDirection: "column", gap: 8, fontWeight: 500 }}>
              {stats.stockouts.length > 0 && (
                <li>Deploy emergency ASV vials from Gandhi Hospital reserves to stockout facilities.</li>
              )}
              {stats.icu < 3 && (
                <li>Prioritize ICU ventilator upgrades at rural Government CHCs.</li>
              )}
              <li>Instruct ASHA supervisors to audit stock updates older than 24 hours.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, value, label, tone, bg, isAlert }) {
  return (
    <div
      className="card card-hover"
      style={{
        padding: "20px 18px",
        background: bg,
        border: isAlert ? "2px solid var(--danger)" : "none",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 110
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: tone }}>
        {icon}
        {isAlert && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--danger)", animation: "pulseLive 1s infinite" }} />}
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 900, color: tone, lineHeight: 1, marginTop: 12 }}>
          {value}
        </div>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: isAlert ? "var(--danger)" : "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginTop: 4
        }}>
          {label}
        </div>
      </div>
    </div>
  );
}
