import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, TrendingUp, Compass, Activity, ShieldCheck, Timer, BarChart3, AlertTriangle } from "lucide-react";
import { C } from "../theme.js";
import { tFor } from "../i18n.js";
import { useEmergency } from "../context/EmergencyContext.jsx";

export default function Analytics() {
  const navigate = useNavigate();
  const { language, biteTime, severity, snake } = useEmergency();
  const t = tFor(language);

  const hasLiveCase = !!biteTime;

  // Species stats - historical + active live case if available
  const speciesData = useMemo(() => {
    const base = [
      { name: "Russell's Viper", count: 44, percent: 38, venomous: true },
      { name: "Indian Cobra", count: 37, percent: 32, venomous: true },
      { name: "Saw-scaled Viper", count: 20, percent: 17, venomous: true },
      { name: "Common Krait: ", count: 12, percent: 10, venomous: true },
      { name: "Non-Venomous (Boa/Rat Snake)", count: 4, percent: 3, venomous: false }
    ];

    if (hasLiveCase && snake?.species) {
      const liveName = snake.species;
      const match = base.find(s => liveName.toLowerCase().includes(s.name.toLowerCase().split("'")[0]));
      if (match) {
        match.count += 1;
      } else {
        base.push({ name: liveName, count: 1, percent: 1, venomous: snake.venomous });
      }
      
      // Recalculate percentages
      const total = base.reduce((sum, s) => sum + s.count, 0);
      base.forEach(s => {
        s.percent = Math.round((s.count / total) * 100);
      });
    }

    return base.sort((a, b) => b.count - a.count);
  }, [hasLiveCase, snake]);

  // Hospital admissions usage
  const hospitalData = [
    { name: "District Hospital Vikarabad", count: 52, cap: 30 },
    { name: "Area Hospital Vikarabad", count: 31, cap: 24 },
    { name: "CHC Tandur", count: 18, cap: 8 },
    { name: "CHC Parigi", count: 12, cap: 0 },
    { name: "PHC Doultabad", count: 6, cap: 2 }
  ];

  // Logistics & consumption
  const logistics = {
    totalVials: 580 + (hasLiveCase ? (severity === "severe" ? 10 : severity === "moderate" ? 6 : 4) : 0),
    avgDose: 9.8,
    reserved: hasLiveCase ? (severity === "severe" ? 10 : severity === "moderate" ? 6 : 4) : 0,
    wastage: "2.1%"
  };

  // Monthly trends (bezier data points)
  const trends = [
    { month: "Jan", cases: 12 },
    { month: "Feb", cases: 18 },
    { month: "Mar", cases: 25 },
    { month: "Apr", cases: 42 },
    { month: "May", cases: 68 },
    { month: "Jun", cases: 94 }
  ];

  // SVG dimensions for charts
  const trendMax = Math.max(...trends.map(t => t.cases));
  const trendPoints = trends.map((pt, idx) => {
    const x = 30 + idx * 70;
    const y = 140 - (pt.cases / trendMax) * 100;
    return { x, y, ...pt };
  });

  // Bezier line computation
  const linePath = useMemo(() => {
    return trendPoints.reduce((path, pt, idx) => {
      if (idx === 0) return `M ${pt.x} ${pt.y}`;
      // Smooth bezier control points
      const prev = trendPoints[idx - 1];
      const cpX1 = prev.x + 35;
      const cpY1 = prev.y;
      const cpX2 = pt.x - 35;
      const cpY2 = pt.y;
      return `${path} C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${pt.x} ${pt.y}`;
    }, "");
  }, [trendPoints]);

  return (
    <div className="px-4 pt-4 pb-8 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          aria-label={t.analytics.back}
          className="rounded-lg p-1.5 shrink-0 active:scale-95 transition-transform"
          style={{ background: C.tealPale }}
        >
          <ChevronLeft size={18} style={{ color: C.teal }} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold leading-tight" style={{ color: C.dark }}>
            {t.analytics.title}
          </h1>
          <p className="text-xs leading-snug" style={{ color: C.muted }}>
            {t.analytics.subtitle}
          </p>
        </div>
      </div>

      {/* Live Case Indicator Alert */}
      {hasLiveCase && (
        <div className="rounded-xl border p-2.5 flex items-center gap-2" style={{ borderColor: C.orange + "44", background: C.orangePale }}>
          <Activity size={14} className="shrink-0 ap-spin" style={{ color: C.orange }} />
          <span className="text-[11px] font-bold" style={{ color: C.orange }}>
            {t.analytics.activeCaseIndicator} ({snake?.species || "Unidentified"})
          </span>
        </div>
      )}

      {/* Grid Layout (2 cols on tablet/desktop) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* ── Hotspots Heatmap Map (SVG-visualised outline map) ── */}
        <div className="rounded-2xl border p-4 bg-white flex flex-col gap-3" style={{ borderColor: "#E1EAE9" }}>
          <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: C.muted }}>
            <Compass size={14} style={{ color: C.teal }} />
            {t.analytics.heatmap}
          </span>
          <div className="relative rounded-xl border overflow-hidden aspect-video bg-[#EDF3F2] flex items-center justify-center" style={{ borderColor: "#F2F7F6" }}>
            {/* Styled vector map graphics */}
            <svg viewBox="0 0 320 180" className="w-full h-full">
              {/* Vikarabad district administrative borders (simulated outlines) */}
              <path
                d="M 50 40 Q 90 20 150 30 T 250 20 T 290 80 T 270 140 T 170 160 T 80 150 T 40 90 Z"
                fill="#E1EAE9"
                stroke="#C5DBD9"
                strokeWidth="1.5"
              />
              <path
                d="M 120 30 Q 140 80 170 100 T 230 140"
                fill="none"
                stroke="#D7E3E2"
                strokeWidth="1"
                strokeDasharray="3,3"
              />
              <path
                d="M 70 80 Q 150 90 250 80"
                fill="none"
                stroke="#D7E3E2"
                strokeWidth="1"
                strokeDasharray="3,3"
              />

              {/* Triage Hotspots (circles sized by density) */}
              {/* Hotspot 1: Vikarabad Town Center (High density) */}
              <circle cx="180" cy="80" r="16" fill={`${C.danger}33`} />
              <circle cx="180" cy="80" r="6" fill={C.danger} />
              <circle cx="180" cy="80" r="1.5" fill="#fff" />
              <text x="180" y="60" textAnchor="middle" fill={C.dark} fontSize="9" fontWeight="bold">Vikarabad</text>

              {/* Hotspot 2: Tandur Town (High density) */}
              <circle cx="90" cy="110" r="12" fill={`${C.danger}26`} />
              <circle cx="90" cy="110" r="5" fill={C.danger} />
              <text x="90" y="125" textAnchor="middle" fill={C.dark} fontSize="9" fontWeight="bold">Tandur</text>

              {/* Hotspot 3: Marpally Village (Moderate density) */}
              <circle cx="130" cy="50" r="10" fill={`${C.amber}26`} />
              <circle cx="130" cy="50" r="4.5" fill={C.amber} />
              <text x="130" y="38" textAnchor="middle" fill={C.dark} fontSize="9" fontWeight="bold">Marpally</text>

              {/* Hotspot 4: Parigi (Moderate density) */}
              <circle cx="210" cy="120" r="8" fill={`${C.amber}26`} />
              <circle cx="210" cy="120" r="4" fill={C.amber} />
              <text x="210" y="136" textAnchor="middle" fill={C.dark} fontSize="9" fontWeight="bold">Parigi</text>
            </svg>
            <div className="absolute bottom-2 left-2 rounded bg-white/90 backdrop-blur px-2 py-1 text-[9px] font-bold flex gap-3 border shadow-sm" style={{ borderColor: "#E1EAE9" }}>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: C.danger }}></span>High</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: C.amber }}></span>Moderate</span>
            </div>
          </div>
        </div>

        {/* ── Monthly Cases Trend (Bezier Line Chart) ── */}
        <div className="rounded-2xl border p-4 bg-white flex flex-col gap-3" style={{ borderColor: "#E1EAE9" }}>
          <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: C.muted }}>
            <TrendingUp size={14} style={{ color: C.teal }} />
            {t.analytics.trend}
          </span>
          <div className="border rounded-xl overflow-hidden aspect-video bg-white p-2" style={{ borderColor: "#F2F7F6" }}>
            <svg viewBox="0 0 400 160" className="w-full h-full">
              {/* Grid Y lines */}
              <line x1="30" y1="40" x2="380" y2="40" stroke="#F2F7F6" strokeWidth="1" />
              <line x1="30" y1="90" x2="380" y2="90" stroke="#F2F7F6" strokeWidth="1" />
              <line x1="30" y1="140" x2="380" y2="140" stroke="#E1EAE9" strokeWidth="1.5" />

              {/* Area under bezier line */}
              <path
                d={`${linePath} L ${trendPoints[trendPoints.length - 1].x} 140 L ${trendPoints[0].x} 140 Z`}
                fill={`url(#areaGrad)`}
                opacity="0.15"
              />

              {/* Bezier trend line */}
              <path
                d={linePath}
                fill="none"
                stroke={C.teal}
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Gradients */}
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.teal} />
                  <stop offset="100%" stopColor="#fff" />
                </linearGradient>
              </defs>

              {/* Active points */}
              {trendPoints.map((pt, idx) => (
                <g key={pt.month}>
                  <circle cx={pt.x} cy={pt.y} r="4" fill={C.teal} />
                  <circle cx={pt.x} cy={pt.y} r="2" fill="#fff" />
                  <text x={pt.x} y="154" textAnchor="middle" fill={C.muted} fontSize="9" fontWeight="bold">
                    {pt.month}
                  </text>
                  <text x={pt.x} y={pt.y - 8} textAnchor="middle" fill={C.dark} fontSize="8" fontWeight="bold">
                    {pt.cases}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>

        {/* ── Venomous Species Frequency (Horizontal Bars) ── */}
        <div className="rounded-2xl border p-4 bg-white flex flex-col gap-3.5" style={{ borderColor: "#E1EAE9" }}>
          <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: C.muted }}>
            <AlertTriangle size={14} style={{ color: C.teal }} />
            {t.analytics.species}
          </span>
          <div className="flex flex-col gap-3">
            {speciesData.map(s => (
              <div key={s.name} className="flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between font-bold">
                  <span style={{ color: C.dark }} className="truncate max-w-[200px]">
                    {s.name}
                  </span>
                  <span style={{ color: C.muted }}>
                    {s.count} {t.analytics.cases} ({s.percent}%)
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-[#EDF3F2] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${s.percent}%`,
                      background: s.venomous ? C.danger : C.good
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Hospital Admissions Usage (Vertical Columns) ── */}
        <div className="rounded-2xl border p-4 bg-white flex flex-col gap-3" style={{ borderColor: "#E1EAE9" }}>
          <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: C.muted }}>
            <BarChart3 size={14} style={{ color: C.teal }} />
            {t.analytics.usage}
          </span>
          <div className="border rounded-xl overflow-hidden aspect-video bg-white p-2" style={{ borderColor: "#F2F7F6" }}>
            <svg viewBox="0 0 400 160" className="w-full h-full">
              {/* Baseline */}
              <line x1="20" y1="130" x2="380" y2="130" stroke="#E1EAE9" strokeWidth="1.5" />
              
              {hospitalData.map((h, idx) => {
                const x = 30 + idx * 72;
                const barHeight = (h.count / 60) * 100;
                const barY = 130 - barHeight;

                return (
                  <g key={h.name}>
                    {/* Columns bar */}
                    <rect
                      x={x}
                      y={barY}
                      width="28"
                      height={barHeight}
                      rx="4"
                      fill={C.teal}
                    />
                    {/* Value */}
                    <text x={x + 14} y={barY - 6} textAnchor="middle" fill={C.dark} fontSize="9" fontWeight="extrabold">
                      {h.count}
                    </text>
                    {/* Tiny labels */}
                    <text x={x + 14} y="143" textAnchor="middle" fill={C.muted} fontSize="8" fontWeight="bold">
                      {h.name.split(" ").map(w => w[0]).join("")}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* ── Antivenom Logistics Metrics ── */}
        <div className="rounded-2xl border p-4 bg-white flex flex-col gap-3" style={{ borderColor: "#E1EAE9" }}>
          <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: C.muted }}>
            <ShieldCheck size={14} style={{ color: C.teal }} />
            {t.analytics.consumption}
          </span>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border p-3 flex flex-col gap-1 bg-[#F2F7F6]" style={{ borderColor: "#E1EAE9" }}>
              <span className="font-bold text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>
                {t.analytics.metrics.totalVials}
              </span>
              <span className="text-xl font-black" style={{ color: C.dark }}>
                {logistics.totalVials}
              </span>
            </div>
            <div className="rounded-xl border p-3 flex flex-col gap-1 bg-[#F2F7F6]" style={{ borderColor: "#E1EAE9" }}>
              <span className="font-bold text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>
                {t.analytics.metrics.avgDose}
              </span>
              <span className="text-xl font-black" style={{ color: C.dark }}>
                {logistics.avgDose} <span className="text-[10px] font-semibold">{t.analytics.vials}</span>
              </span>
            </div>
            <div className="rounded-xl border p-3 flex flex-col gap-1 bg-[#F2F7F6]" style={{ borderColor: "#E1EAE9" }}>
              <span className="font-bold text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>
                {t.analytics.metrics.reserved}
              </span>
              <span className="text-xl font-black" style={{ color: C.orange }}>
                {logistics.reserved} <span className="text-[10px] font-semibold">{t.analytics.vials}</span>
              </span>
            </div>
            <div className="rounded-xl border p-3 flex flex-col gap-1 bg-[#F2F7F6]" style={{ borderColor: "#E1EAE9" }}>
              <span className="font-bold text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>
                {t.analytics.metrics.wastage}
              </span>
              <span className="text-xl font-black" style={{ color: C.good }}>
                {logistics.wastage}
              </span>
            </div>
          </div>
        </div>

        {/* ── Average Response Times ── */}
        <div className="rounded-2xl border p-4 bg-white flex flex-col gap-3" style={{ borderColor: "#E1EAE9" }}>
          <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: C.muted }}>
            <Timer size={14} style={{ color: C.teal }} />
            {t.analytics.response}
          </span>
          <div className="flex flex-col gap-2.5">
            {[
              { label: t.analytics.responseTimes.dispatch, value: "4.8", color: C.amber },
              { label: t.analytics.responseTimes.travel, value: "24.3", color: C.teal },
              { label: t.analytics.responseTimes.treatment, value: "32.5", color: C.good }
            ].map(r => (
              <div key={r.label} className="rounded-xl border p-3 flex items-center justify-between text-xs" style={{ borderColor: "#F2F7F6", background: "#FDFDFD" }}>
                <span className="font-bold" style={{ color: C.dark }}>{r.label}</span>
                <span className="font-black text-sm" style={{ color: r.color }}>
                  {r.value} <span className="text-[10px] font-bold" style={{ color: C.muted }}>{t.analytics.timeVal}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
