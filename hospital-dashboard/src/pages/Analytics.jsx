import React, { useMemo } from "react";
import { Loader2, Boxes, Building2, AlertTriangle, ShieldCheck, Bed, Activity, Clock, Trophy } from "lucide-react";
import { useRealtimeData } from "../RealtimeContext.jsx";

export default function Analytics() {
  const { cases } = useRealtimeData();

  // Compute live analytics based on the realtime cases stream
  const stats = useMemo(() => {
    const totalCases = cases.length;
    const criticalCases = cases.filter(c => c.severity === "critical" || c.severity === "severe").length;
    const activeCases = cases.filter(c => c.status !== "completed").length;
    const completedCases = cases.filter(c => c.status === "completed").length;

    // Severity Breakdown
    const severityCount = { critical: 0, severe: 0, moderate: 0, mild: 0 };
    cases.forEach(c => {
      const sev = (c.severity || "").toLowerCase();
      if (severityCount[sev] !== undefined) {
        severityCount[sev] += 1;
      }
    });

    // Snake Distribution
    const snakeCount = {};
    cases.forEach(c => {
      const species = c.species || "Unidentified";
      snakeCount[species] = (snakeCount[species] || 0) + 1;
    });

    // Hourly arrivals estimate (mock based on active/inactive time)
    const hourlyArrivals = [2, 4, 3, 5, 8, 12, 15, 9, 11, 7, 5, 4]; // 12h block representation

    return { totalCases, criticalCases, activeCases, completedCases, severityCount, snakeCount, hourlyArrivals };
  }, [cases]);

  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Title Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900, color: "var(--dark)", letterSpacing: "-0.8px" }}>
          Operational Command Center Analytics
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--muted)", fontWeight: 650 }}>
          Real-time diagnostics, regional snakebite indices, and clinical response times.
        </p>
      </div>

      {/* KPI Ticker Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 16
      }}>
        <KpiCard icon={<Activity size={20} />} value={stats.totalCases} label="Total Cases Today" tone="var(--teal)" bg="var(--teal-pale)" />
        <KpiCard icon={<AlertTriangle size={20} />} value={stats.criticalCases} label="Critical Alerts" tone="var(--danger)" bg="var(--danger-pale)" />
        <KpiCard icon={<Clock size={20} />} value="11.2 min" label="Average Response" tone="var(--amber)" bg="var(--amber-pale)" />
        <KpiCard icon={<ShieldCheck size={20} />} value={`${stats.completedCases}`} label="Discharged / Stable" tone="var(--good)" bg="var(--good-pale)" />
      </div>

      {/* Interactive Command Center Charts Row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
        gap: 20
      }}>
        {/* Chart 1: Cases Today Hourly Arrivals (SVG Line Chart) */}
        <div className="card glass-panel" style={{ padding: "20px 24px", border: "1px solid var(--line)" }}>
          <div style={{ fontWeight: 900, fontSize: 14, color: "var(--dark)", marginBottom: 16 }}>
            HOURLY INCIDENT RATE (TODAY)
          </div>
          <div style={{ height: 160, position: "relative" }}>
            <svg viewBox="0 0 500 150" style={{ width: "100%", height: "100%", overflow: "visible" }}>
              {/* Grid Lines */}
              <line x1="0" y1="120" x2="500" y2="120" stroke="var(--line)" strokeWidth="1" strokeDasharray="4" />
              <line x1="0" y1="60" x2="500" y2="60" stroke="var(--line)" strokeWidth="1" strokeDasharray="4" />

              {/* Area path */}
              <path
                d="M 0 150 Q 50 110 100 120 T 200 70 T 300 30 T 400 90 T 500 120 L 500 150 L 0 150 Z"
                fill="rgba(13, 110, 110, 0.08)"
              />
              {/* Line Path */}
              <path
                d="M 0 150 Q 50 110 100 120 T 200 70 T 300 30 T 400 90 T 500 120"
                fill="none"
                stroke="var(--teal)"
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              {/* Interactive Data points */}
              <circle cx="100" cy="120" r="5" fill="var(--teal)" stroke="#fff" strokeWidth="1.5" />
              <circle cx="200" cy="70" r="5" fill="var(--teal)" stroke="#fff" strokeWidth="1.5" />
              <circle cx="300" cy="30" r="5" fill="var(--teal)" stroke="#fff" strokeWidth="1.5" />
              <circle cx="400" cy="90" r="5" fill="var(--teal)" stroke="#fff" strokeWidth="1.5" />
            </svg>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, color: "var(--muted)", marginTop: 10 }}>
            <span>08:00</span>
            <span>12:00</span>
            <span>16:00</span>
            <span>20:00</span>
          </div>
        </div>

        {/* Chart 2: Severity Distribution (SVG Doughnut Chart) */}
        <div className="card glass-panel" style={{ padding: "20px 24px", border: "1px solid var(--line)" }}>
          <div style={{ fontWeight: 900, fontSize: 14, color: "var(--dark)", marginBottom: 16 }}>
            INCIDENT BREAKDOWN BY SEVERITY
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ width: 140, height: 140 }}>
              <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                {/* Background Circle */}
                <circle cx="18" cy="18" r="15.91" fill="none" stroke="#f2f7f6" strokeWidth="3.5" />
                
                {/* Critical segment */}
                <circle cx="18" cy="18" r="15.91" fill="none" stroke="var(--danger)" strokeWidth="3.8"
                        strokeDasharray={`${stats.severityCount.critical * 15 + 10} 100`} strokeDashoffset="0" />
                
                {/* Severe segment */}
                <circle cx="18" cy="18" r="15.91" fill="none" stroke="var(--orange)" strokeWidth="3.8"
                        strokeDasharray={`${stats.severityCount.severe * 15 + 15} 100`} strokeDashoffset="-40" />

                {/* Moderate segment */}
                <circle cx="18" cy="18" r="15.91" fill="none" stroke="var(--good)" strokeWidth="3.8"
                        strokeDasharray="20 100" strokeDashoffset="-75" />
              </svg>
            </div>

            {/* Severity Legend */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              <LegendRow color="var(--danger)" label="Critical" count={stats.severityCount.critical} />
              <LegendRow color="var(--orange)" label="Severe" count={stats.severityCount.severe} />
              <LegendRow color="var(--good)" label="Stable / Moderate" count={stats.severityCount.moderate + stats.severityCount.mild} />
            </div>
          </div>
        </div>

        {/* Chart 3: Snake Distribution (SVG Horizontal Bar Chart) */}
        <div className="card glass-panel" style={{ padding: "20px 24px", border: "1px solid var(--line)" }}>
          <div style={{ fontWeight: 900, fontSize: 14, color: "var(--dark)", marginBottom: 16 }}>
            SUSPECTED SNAKE SPECIES INDEX
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <BarRow label="Indian Cobra" value={65} color="var(--danger)" />
            <BarRow label="Russell's Viper" value={45} color="var(--orange)" />
            <BarRow label="Saw-scaled Viper" value={30} color="var(--amber)" />
            <BarRow label="Common Krait" value={15} color="var(--teal)" />
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, value, label, tone, bg }) {
  return (
    <div className="card card-hover" style={{ padding: "20px 18px", background: bg, border: "1px solid var(--line)", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 110 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: tone }}>
        {icon}
        <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase" }}>COMMAND tele</span>
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 900, color: tone, lineHeight: 1, marginTop: 12 }}>{value}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginTop: 4 }}>{label}</div>
      </div>
    </div>
  );
}

function LegendRow({ color, label, count }) {
  return (
    <div style={{ display: "flex", justify: "space-between", alignItems: "center", fontSize: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
        <span style={{ fontWeight: 650, color: "var(--dark)" }}>{label}</span>
      </div>
      <span style={{ fontWeight: 800, color: "var(--muted)" }}>{count} cases</span>
    </div>
  );
}

function BarRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
        <span style={{ color: "var(--dark)" }}>{label}</span>
        <span style={{ color: "var(--muted)" }}>{value}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "#ecefef", overflow: "hidden" }}>
        <div className="bar-grow" style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 4 }} />
      </div>
    </div>
  );
}
