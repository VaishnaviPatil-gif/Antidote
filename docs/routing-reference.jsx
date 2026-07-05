import React, { useState, useMemo, useCallback } from "react";
import {
  MapPin, Navigation, Phone, Share2, AlertTriangle, CheckCircle2,
  Clock, Activity, ShieldCheck, X, Droplets, ChevronRight, Languages,
  Crosshair, Building2, Siren, ArrowRight, Timer, RadioTower,
} from "lucide-react";

/**
 * Antidote+ — Hospital Stock + Routing Flow (demo MVP)
 * The differentiator: route the snakebite victim NOT to the nearest facility,
 * but to the nearest facility that ACTUALLY HAS anti-snake-venom (ASV) in stock.
 *
 * Scenario: victim in Marpally, Vikarabad district (rural Telangana), bitten 18 min ago.
 * Seeded inventory across 8 facilities. Distances are real haversine from coordinates.
 */

// ── Brand palette (JeevanSetu / Antidote+) ────────────────────────────────
const C = {
  teal: "#0D6E6E",
  tealLight: "#1A9999",
  tealPale: "#E6F4F4",
  tealDark: "#0A4F4F",
  orange: "#E86A17",
  orangePale: "#FEF0E6",
  dark: "#142826",
  muted: "#5E7A78",
  danger: "#C0392B",
  dangerPale: "#FBEBE9",
  good: "#1F8A5B",
  goodPale: "#E7F4EE",
  amber: "#B8730A",
  amberPale: "#FBF1E0",
};

// ── i18n: only the decision-critical labels are translated ────────────────
const T = {
  en: {
    tag: "AI Snakebite Emergency Network",
    bitten: "Bitten", ago: "min ago", victim: "Victim location",
    severity: "Symptom severity", mild: "Mild", moderate: "Moderate", severe: "Severe",
    sevHint: { mild: "Local pain & swelling", moderate: "Spreading swelling, nausea", severe: "Breathing / bleeding / drooping eyelids" },
    goHere: "Go to this hospital", hasAsv: "Antivenom in stock",
    nearestTrap: "Nearest — but no antivenom", wouldWaste: "Going here wastes",
    away: "away", eta: "ETA by road", vials: "ASV vials", updated: "Stock updated",
    confirmBtn: "Confirm & alert hospital", confirming: "Alerting hospital…",
    confirmed: "Hospital confirmed", reserved: "vials reserved for you",
    startNav: "Start navigation", shareLoc: "Share live location", callHosp: "Call hospital",
    locShared: "Live location & symptoms shared", otherOpts: "Other facilities with stock",
    dontChase: "Don't chase the snake",
    dontChaseBody: "Treatment is based on your symptoms, not the species. Antivenom in India is polyvalent — it covers all four major venomous snakes. Photograph it only if completely safe.",
    trust: "Stock updated by hospital staff & ASHA workers. Demo inventory across Vikarabad district.",
    limited: "Limited — can stabilise, may refer onward", stale: "needs reconfirmation",
    reserving: "Reserving antivenom", relaying: "Relaying your symptoms & location",
    minsFurther: "further than the nearest clinic — but treatment is guaranteed here",
    icu: "ICU", phc: "Primary Health Centre", chc: "Community Health Centre",
    ah: "Area Hospital", dh: "District Hospital", tertiary: "Tertiary Hospital",
  },
  hi: {
    tag: "एआई सर्पदंश आपातकालीन नेटवर्क",
    bitten: "काटा", ago: "मिनट पहले", victim: "रोगी का स्थान",
    severity: "लक्षण की गंभीरता", mild: "हल्का", moderate: "मध्यम", severe: "गंभीर",
    sevHint: { mild: "स्थानीय दर्द व सूजन", moderate: "फैलती सूजन, मतली", severe: "साँस / रक्तस्राव / पलकें झुकना" },
    goHere: "इस अस्पताल जाएँ", hasAsv: "एंटीवेनम उपलब्ध",
    nearestTrap: "सबसे नज़दीक — पर एंटीवेनम नहीं", wouldWaste: "यहाँ जाने से बर्बाद होंगे",
    away: "दूर", eta: "सड़क मार्ग से समय", vials: "ASV शीशियाँ", updated: "स्टॉक अपडेट",
    confirmBtn: "पुष्टि करें व अस्पताल को सूचित करें", confirming: "अस्पताल को सूचित किया जा रहा…",
    confirmed: "अस्पताल ने पुष्टि की", reserved: "शीशियाँ आपके लिए सुरक्षित",
    startNav: "रास्ता शुरू करें", shareLoc: "लाइव लोकेशन भेजें", callHosp: "अस्पताल को कॉल करें",
    locShared: "लाइव लोकेशन व लक्षण भेजे गए", otherOpts: "स्टॉक वाले अन्य केंद्र",
    dontChase: "साँप का पीछा न करें",
    dontChaseBody: "इलाज प्रजाति पर नहीं, आपके लक्षणों पर आधारित है। भारत में एंटीवेनम पॉलीवैलेंट है — यह चारों प्रमुख विषैले साँपों पर काम करता है। फोटो तभी लें जब पूरी तरह सुरक्षित हो।",
    trust: "स्टॉक अस्पताल कर्मी व आशा कार्यकर्ता अपडेट करते हैं। विकाराबाद ज़िले का डेमो डेटा।",
    limited: "सीमित — स्थिर कर सकते हैं, आगे रेफर संभव", stale: "पुनः पुष्टि आवश्यक",
    reserving: "एंटीवेनम सुरक्षित किया जा रहा", relaying: "आपके लक्षण व लोकेशन भेजे जा रहे",
    minsFurther: "नज़दीकी क्लिनिक से दूर — पर यहाँ इलाज निश्चित है",
    icu: "आईसीयू", phc: "प्राथमिक स्वास्थ्य केंद्र", chc: "सामुदायिक स्वास्थ्य केंद्र",
    ah: "क्षेत्रीय अस्पताल", dh: "ज़िला अस्पताल", tertiary: "तृतीयक अस्पताल",
  },
  te: {
    tag: "AI పాముకాటు అత్యవసర నెట్‌వర్క్",
    bitten: "కాటు", ago: "నిమి. క్రితం", victim: "బాధితుని ప్రాంతం",
    severity: "లక్షణాల తీవ్రత", mild: "తేలికపాటి", moderate: "మధ్యస్థం", severe: "తీవ్రం",
    sevHint: { mild: "స్థానిక నొప్పి, వాపు", moderate: "వ్యాపించే వాపు, వాంతి", severe: "శ్వాస / రక్తస్రావం / కనురెప్పలు వాలడం" },
    goHere: "ఈ ఆసుపత్రికి వెళ్లండి", hasAsv: "యాంటీవెనమ్ అందుబాటులో ఉంది",
    nearestTrap: "దగ్గర — కానీ యాంటీవెనమ్ లేదు", wouldWaste: "ఇక్కడికి వెళ్తే వృథా",
    away: "దూరం", eta: "రోడ్డు మార్గం సమయం", vials: "ASV సీసాలు", updated: "స్టాక్ నవీకరణ",
    confirmBtn: "నిర్ధారించి ఆసుపత్రికి తెలియజేయండి", confirming: "ఆసుపత్రికి తెలియజేస్తోంది…",
    confirmed: "ఆసుపత్రి నిర్ధారించింది", reserved: "సీసాలు మీ కోసం రిజర్వ్",
    startNav: "నావిగేషన్ ప్రారంభించండి", shareLoc: "లైవ్ లొకేషన్ పంపండి", callHosp: "ఆసుపత్రికి కాల్ చేయండి",
    locShared: "లైవ్ లొకేషన్ & లక్షణాలు పంపబడ్డాయి", otherOpts: "స్టాక్ ఉన్న ఇతర కేంద్రాలు",
    dontChase: "పామును వెంబడించవద్దు",
    dontChaseBody: "చికిత్స జాతిపై కాదు, మీ లక్షణాలపై ఆధారపడుతుంది. భారత్‌లో యాంటీవెనమ్ పాలీవేలెంట్ — నాలుగు ప్రధాన విషపూరిత పాములకూ పనిచేస్తుంది. పూర్తిగా సురక్షితమైతేనే ఫోటో తీయండి.",
    trust: "స్టాక్‌ను ఆసుపత్రి సిబ్బంది & ఆశా కార్యకర్తలు నవీకరిస్తారు. వికారాబాద్ జిల్లా డెమో డేటా.",
    limited: "పరిమితం — స్థిరపరచవచ్చు, ముందుకు రెఫర్ చేయవచ్చు", stale: "మళ్లీ నిర్ధారణ అవసరం",
    reserving: "యాంటీవెనమ్ రిజర్వ్ చేస్తోంది", relaying: "మీ లక్షణాలు & లొకేషన్ పంపుతోంది",
    minsFurther: "దగ్గరి క్లినిక్ కంటే దూరం — కానీ ఇక్కడ చికిత్స ఖచ్చితం",
    icu: "ఐసీయూ", phc: "ప్రాథమిక ఆరోగ్య కేంద్రం", chc: "సామాజిక ఆరోగ్య కేంద్రం",
    ah: "ఏరియా ఆసుపత్రి", dh: "జిల్లా ఆసుపత్రి", tertiary: "తృతీయ ఆసుపత్రి",
  },
};

// ── Victim + seeded facility inventory (real coords → real distances) ──────
const VICTIM = { lat: 17.270, lng: 77.770 };

const FACILITIES = [
  { id: "phc-marpally",  name: "PHC Marpally",            tierKey: "phc", lat: 17.262, lng: 77.785, vials: 0,   updatedMin: 185, icu: false },
  { id: "phc-doulta",    name: "PHC Doultabad",           tierKey: "phc", lat: 17.305, lng: 77.730, vials: 2,   updatedMin: 540, icu: false },
  { id: "chc-tandur",    name: "CHC Tandur",              tierKey: "chc", lat: 17.245, lng: 77.575, vials: 8,   updatedMin: 41,  icu: false },
  { id: "ah-vikarabad",  name: "Area Hospital Vikarabad", tierKey: "ah",  lat: 17.337, lng: 77.905, vials: 24,  updatedMin: 12,  icu: false },
  { id: "dh-vikarabad",  name: "District Hospital Vikarabad", tierKey: "dh", lat: 17.331, lng: 77.901, vials: 30, updatedMin: 25, icu: true },
  { id: "chc-parigi",    name: "CHC Parigi",              tierKey: "chc", lat: 17.130, lng: 77.870, vials: 0,   updatedMin: 95,  icu: false },
  { id: "gandhi",        name: "Gandhi Hospital, Secunderabad", tierKey: "tertiary", lat: 17.443, lng: 78.499, vials: 120, updatedMin: 18, icu: true },
  { id: "nims",          name: "NIMS, Hyderabad",         tierKey: "tertiary", lat: 17.428, lng: 78.448, vials: 90, updatedMin: 33, icu: true },
];

const RURAL_SPEED_KMH = 35;
const STALE_MIN = 360; // 6 hours → flag for reconfirmation

const toRad = (d) => (d * Math.PI) / 180;
function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const etaMin = (km) => Math.max(1, Math.round((km / RURAL_SPEED_KMH) * 60));
const fmtUpdated = (m) => (m < 60 ? `${m} min` : `${(m / 60).toFixed(m % 60 === 0 ? 0 : 1)} hr`);

// stock tier relative to severity requirement
function stockTier(vials, requiredVials) {
  if (vials <= 0) return "out";
  if (vials >= requiredVials) return "adequate";
  return "limited";
}

export default function AntidotePlusRouting() {
  const [lang, setLang] = useState("te");
  const [severity, setSeverity] = useState("severe");
  const [phase, setPhase] = useState("triage"); // triage | confirming | confirmed | navigating
  const t = T[lang];

  const requiredVials = severity === "severe" ? 10 : severity === "moderate" ? 6 : 4;

  // Compute distances + classify every facility
  const ranked = useMemo(() => {
    return FACILITIES.map((f) => {
      const km = haversineKm(VICTIM, f);
      const tier = stockTier(f.vials, requiredVials);
      const stale = f.updatedMin > STALE_MIN && f.vials > 0;
      return { ...f, km, eta: etaMin(km), tier, stale };
    }).sort((a, b) => a.km - b.km);
  }, [requiredVials]);

  const nearest = ranked[0];

  // Recommendation: nearest ADEQUATE & fresh; tie-break prefers ICU for severe.
  const recommended = useMemo(() => {
    const usable = ranked.filter((f) => f.tier !== "out" && !f.stale);
    const adequate = usable.filter((f) => f.tier === "adequate");
    const pool = adequate.length ? adequate : usable;
    if (!pool.length) return null;
    // nearest in pool; if severe, prefer ICU within a 5km band of the nearest
    const sorted = [...pool].sort((a, b) => a.km - b.km);
    if (severity === "severe") {
      const lead = sorted[0];
      const icuNearby = sorted.find((f) => f.icu && f.km <= lead.km + 5);
      return icuNearby || lead;
    }
    return sorted[0];
  }, [ranked, severity]);

  const isTrap = recommended && nearest && nearest.id !== recommended.id;
  const minsFurther = recommended ? recommended.eta - nearest.eta : 0;

  const others = useMemo(
    () =>
      ranked.filter(
        (f) => f.tier !== "out" && f.id !== recommended?.id
      ),
    [ranked, recommended]
  );

  const handleConfirm = useCallback(() => {
    setPhase("confirming");
    setTimeout(() => setPhase("confirmed"), 1700);
  }, []);

  const tierName = (k) => t[k] || k;

  return (
    <div style={{ background: "#EDF3F2", minHeight: "100vh" }} className="w-full flex justify-center py-0 sm:py-6">
      <style>{`
        @keyframes pulseRing { 0%{transform:scale(.6);opacity:.7} 80%,100%{transform:scale(2.4);opacity:0} }
        @keyframes dash { to { stroke-dashoffset: -16; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .ap-spin { animation: spin 1s linear infinite; }
      `}</style>

      <div
        className="w-full max-w-[430px] flex flex-col"
        style={{ background: "#F7FAFA", boxShadow: "0 12px 48px rgba(10,79,79,.16)", minHeight: "100vh" }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <header style={{ background: C.teal }} className="px-4 pt-4 pb-3 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="flex items-center justify-center rounded-xl"
                style={{ background: "rgba(255,255,255,.14)", width: 36, height: 36 }}
              >
                <Siren size={20} strokeWidth={2.4} />
              </div>
              <div className="leading-tight">
                <div className="font-bold text-lg tracking-tight">Antidote+</div>
                <div style={{ color: "#BFE3E1" }} className="text-xs">{t.tag}</div>
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-full p-0.5" style={{ background: "rgba(255,255,255,.12)" }}>
              {["te", "hi", "en"].map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  aria-label={`Switch to ${l}`}
                  className="rounded-full text-xs font-semibold transition-colors"
                  style={{
                    minWidth: 34, height: 30, padding: "0 8px",
                    background: lang === l ? "#fff" : "transparent",
                    color: lang === l ? C.teal : "#DCEFEE",
                  }}
                >
                  {l === "te" ? "తె" : l === "hi" ? "हि" : "EN"}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* ── Victim status strip ────────────────────────────────── */}
        <div style={{ background: C.dark }} className="px-4 py-2.5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Crosshair size={16} style={{ color: C.orange }} className="shrink-0" />
            <div className="min-w-0">
              <div className="text-xs" style={{ color: "#9FBFBD" }}>{t.victim}</div>
              <div className="text-sm font-semibold truncate">Marpally, Vikarabad</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1" style={{ background: "rgba(192,57,43,.22)" }}>
            <Clock size={14} style={{ color: "#FF9B8E" }} />
            <span className="text-sm font-bold tabular-nums" style={{ color: "#FFD2CA" }}>
              {t.bitten} 18 {t.ago}
            </span>
          </div>
        </div>

        {/* ── Severity selector (feeds the routing engine) ───────── */}
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center gap-1.5 mb-2">
            <Activity size={15} style={{ color: C.teal }} />
            <span className="text-sm font-semibold" style={{ color: C.dark }}>{t.severity}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["mild", "moderate", "severe"].map((s) => {
              const active = severity === s;
              const tone = s === "severe" ? C.danger : s === "moderate" ? C.amber : C.good;
              return (
                <button
                  key={s}
                  onClick={() => { setSeverity(s); setPhase("triage"); }}
                  className="rounded-xl border text-left px-2.5 py-2 transition-all"
                  style={{
                    borderColor: active ? tone : "#D7E3E2",
                    background: active ? (s === "severe" ? C.dangerPale : s === "moderate" ? C.amberPale : C.goodPale) : "#fff",
                    borderWidth: active ? 2 : 1,
                  }}
                >
                  <div className="text-sm font-bold" style={{ color: active ? tone : C.dark }}>{t[s]}</div>
                  <div className="text-xs leading-tight mt-0.5" style={{ color: C.muted }}>{t.sevHint[s]}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Map ────────────────────────────────────────────────── */}
        <div className="px-4 pt-3">
          <RouteMap victim={VICTIM} nearest={nearest} recommended={recommended} ranked={ranked} />
        </div>

        {/* ── The decision ───────────────────────────────────────── */}
        <div className="px-4 pt-4 pb-3 space-y-3">
          {/* Trap card */}
          {isTrap && (
            <div
              className="rounded-2xl border px-4 py-3"
              style={{ borderColor: "#F0CFC9", background: C.dangerPale }}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg p-1.5 shrink-0" style={{ background: "#F6D9D4" }}>
                  <X size={18} style={{ color: C.danger }} strokeWidth={3} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold uppercase tracking-wide" style={{ color: C.danger }}>
                    {t.nearestTrap}
                  </div>
                  <div className="text-base font-bold mt-0.5" style={{ color: C.dark, textDecoration: "line-through", textDecorationColor: "#D88" }}>
                    {nearest.name}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm" style={{ color: C.muted }}>
                    <span className="flex items-center gap-1"><MapPin size={13} />{nearest.km.toFixed(1)} km</span>
                    <span className="flex items-center gap-1"><Timer size={13} />{nearest.eta} min</span>
                    <span className="flex items-center gap-1 font-semibold" style={{ color: C.danger }}>
                      <Droplets size={13} />0 {t.vials}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recommended card */}
          {recommended && (
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: `2px solid ${C.orange}`, boxShadow: "0 8px 24px rgba(232,106,23,.18)" }}
            >
              <div style={{ background: C.orange }} className="px-4 py-2 flex items-center gap-2 text-white">
                <Navigation size={16} fill="#fff" />
                <span className="text-sm font-bold uppercase tracking-wide">{t.goHere}</span>
                {recommended.icu && (
                  <span className="ml-auto text-xs font-bold rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,.22)" }}>
                    {t.icu}
                  </span>
                )}
              </div>

              <div className="px-4 pt-3 pb-4 bg-white">
                <div className="text-xl font-extrabold leading-tight" style={{ color: C.dark }}>
                  {recommended.name}
                </div>
                <div className="text-sm" style={{ color: C.muted }}>{tierName(recommended.tierKey)}</div>

                {/* Big stats row */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <Stat icon={<MapPin size={15} />} value={`${recommended.km.toFixed(0)} km`} label={t.away} color={C.teal} />
                  <Stat icon={<Timer size={15} />} value={`${recommended.eta} min`} label={t.eta} color={C.teal} />
                  <Stat
                    icon={<Droplets size={15} />}
                    value={`${recommended.vials}`}
                    label={t.vials}
                    color={recommended.tier === "adequate" ? C.good : C.amber}
                    big
                  />
                </div>

                {/* Stock status pill */}
                <div
                  className="flex items-center gap-2 mt-3 rounded-xl px-3 py-2"
                  style={{ background: recommended.tier === "adequate" ? C.goodPale : C.amberPale }}
                >
                  <ShieldCheck size={16} style={{ color: recommended.tier === "adequate" ? C.good : C.amber }} />
                  <span className="text-sm font-semibold" style={{ color: recommended.tier === "adequate" ? C.good : C.amber }}>
                    {recommended.tier === "adequate" ? t.hasAsv : t.limited}
                  </span>
                  <span className="ml-auto text-xs flex items-center gap-1" style={{ color: C.muted }}>
                    <RadioTower size={12} />{t.updated} {fmtUpdated(recommended.updatedMin)}
                  </span>
                </div>

                {/* Why further is worth it */}
                {isTrap && minsFurther > 0 && (
                  <div className="text-xs mt-2 leading-snug" style={{ color: C.muted }}>
                    +{minsFurther} min {t.minsFurther}.
                  </div>
                )}

                {/* ── Confirmation flow ── */}
                <div className="mt-3">
                  {phase === "triage" && (
                    <button
                      onClick={handleConfirm}
                      className="w-full rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-transform active:scale-[.98]"
                      style={{ background: C.teal, height: 52, fontSize: 16 }}
                    >
                      <RadioTower size={18} />{t.confirmBtn}
                    </button>
                  )}

                  {phase === "confirming" && (
                    <div className="rounded-xl px-4 py-3" style={{ background: C.tealPale }}>
                      <div className="flex items-center gap-2" style={{ color: C.teal }}>
                        <span className="ap-spin inline-flex"><RadioTower size={18} /></span>
                        <span className="font-semibold text-sm">{t.confirming}</span>
                      </div>
                      <div className="mt-2 space-y-1 text-xs" style={{ color: C.muted }}>
                        <div className="flex items-center gap-1.5"><Droplets size={12} />{t.reserving}…</div>
                        <div className="flex items-center gap-1.5"><Share2 size={12} />{t.relaying}…</div>
                      </div>
                    </div>
                  )}

                  {(phase === "confirmed" || phase === "navigating") && (
                    <div className="space-y-2">
                      <div className="rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ background: C.goodPale }}>
                        <CheckCircle2 size={20} style={{ color: C.good }} />
                        <div className="text-sm leading-tight">
                          <span className="font-bold" style={{ color: C.good }}>{t.confirmed}</span>
                          <span style={{ color: C.dark }}> · {requiredVials} {t.reserved}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setPhase("navigating")}
                        className="w-full rounded-xl text-white font-bold flex items-center justify-center gap-2 active:scale-[.98] transition-transform"
                        style={{ background: C.orange, height: 52, fontSize: 16 }}
                      >
                        <Navigation size={18} fill="#fff" />{t.startNav}
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <SecondaryBtn icon={<Share2 size={16} />} label={t.shareLoc} />
                        <SecondaryBtn icon={<Phone size={16} />} label={t.callHosp} />
                      </div>
                      {phase === "navigating" && (
                        <div className="text-xs flex items-center gap-1.5 justify-center pt-1" style={{ color: C.good }}>
                          <CheckCircle2 size={13} />{t.locShared}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Don't chase the snake ──────────────────────────────── */}
        <div className="px-4 pb-3">
          <div className="rounded-2xl px-4 py-3 flex items-start gap-3" style={{ background: C.tealPale }}>
            <AlertTriangle size={18} style={{ color: C.teal }} className="shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold" style={{ color: C.tealDark }}>{t.dontChase}</div>
              <div className="text-xs leading-snug mt-0.5" style={{ color: C.muted }}>{t.dontChaseBody}</div>
            </div>
          </div>
        </div>

        {/* ── Other stocked facilities ───────────────────────────── */}
        <div className="px-4 pb-4">
          <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: C.muted }}>
            {t.otherOpts}
          </div>
          <div className="space-y-2">
            {others.map((f) => (
              <div key={f.id} className="rounded-xl bg-white border px-3 py-2.5 flex items-center gap-3" style={{ borderColor: "#E1EAE9" }}>
                <div
                  className="rounded-lg p-1.5 shrink-0"
                  style={{ background: f.tier === "adequate" ? C.goodPale : C.amberPale }}
                >
                  <Building2 size={16} style={{ color: f.tier === "adequate" ? C.good : C.amber }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate" style={{ color: C.dark }}>{f.name}</div>
                  <div className="flex items-center gap-2.5 text-xs mt-0.5" style={{ color: C.muted }}>
                    <span>{f.km.toFixed(0)} km · {f.eta} min</span>
                    {f.stale && <span style={{ color: C.amber }} className="font-semibold">⚠ {t.stale}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-base font-extrabold tabular-nums" style={{ color: f.tier === "adequate" ? C.good : C.amber }}>
                    {f.vials}
                  </div>
                  <div className="text-xs" style={{ color: C.muted }}>{t.vials}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Trust footer ───────────────────────────────────────── */}
        <div className="px-4 pb-6 pt-1 mt-auto">
          <div className="flex items-start gap-2 text-xs" style={{ color: C.muted }}>
            <RadioTower size={13} className="shrink-0 mt-0.5" style={{ color: C.tealLight }} />
            <span className="leading-snug">{t.trust}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small presentational pieces ───────────────────────────────────────────
function Stat({ icon, value, label, color, big }) {
  return (
    <div className="rounded-xl px-2 py-2 text-center" style={{ background: "#F2F7F6" }}>
      <div className="flex items-center justify-center gap-1" style={{ color }}>
        {icon}
        <span className={`font-extrabold tabular-nums ${big ? "text-xl" : "text-lg"}`}>{value}</span>
      </div>
      <div className="text-xs mt-0.5" style={{ color: "#6E8A88" }}>{label}</div>
    </div>
  );
}

function SecondaryBtn({ icon, label }) {
  return (
    <button
      className="rounded-xl border font-semibold flex items-center justify-center gap-1.5 active:scale-[.98] transition-transform"
      style={{ borderColor: C.teal, color: C.teal, height: 46, fontSize: 13, background: "#fff" }}
    >
      {icon}<span className="truncate">{label}</span>
    </button>
  );
}

// ── Stylized route map (SVG, fully controllable — no live map needed) ──────
function RouteMap({ victim, nearest, recommended, ranked }) {
  const W = 398, H = 188, PAD = 26;
  const pts = [victim, ...ranked];
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const sx = (lng) => PAD + ((lng - minLng) / (maxLng - minLng || 1)) * (W - 2 * PAD);
  const sy = (lat) => H - PAD - ((lat - minLat) / (maxLat - minLat || 1)) * (H - 2 * PAD);

  const vx = sx(victim.lng), vy = sy(victim.lat);
  const rx = recommended ? sx(recommended.lng) : vx;
  const ry = recommended ? sy(recommended.lat) : vy;
  const nx = sx(nearest.lng), ny = sy(nearest.lat);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Route to the nearest stocked hospital"
      style={{ borderRadius: 16, background: C.tealPale, display: "block" }}>
      {/* ambient road hairlines */}
      {[0.3, 0.55, 0.8].map((f, i) => (
        <line key={i} x1={0} y1={H * f} x2={W} y2={H * (f - 0.12)} stroke="#D2E7E5" strokeWidth="1" />
      ))}

      {/* faint X-ed line to the trap */}
      {nearest.id !== recommended?.id && (
        <line x1={vx} y1={vy} x2={nx} y2={ny} stroke={C.danger} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.5" />
      )}

      {/* live route line to recommended */}
      {recommended && (
        <line x1={vx} y1={vy} x2={rx} y2={ry} stroke={C.orange} strokeWidth="3.5" strokeLinecap="round"
          strokeDasharray="2 6" style={{ animation: "dash .6s linear infinite" }} />
      )}

      {/* other facility dots */}
      {ranked.map((f) => {
        if (f.id === recommended?.id || f.id === nearest.id) return null;
        const col = f.vials <= 0 ? "#C9A7A2" : f.vials >= 10 ? C.good : C.amber;
        return <circle key={f.id} cx={sx(f.lng)} cy={sy(f.lat)} r="3.5" fill={col} opacity="0.7" />;
      })}

      {/* trap pin */}
      {nearest.id !== recommended?.id && (
        <g transform={`translate(${nx},${ny})`}>
          <circle r="9" fill="#fff" stroke={C.danger} strokeWidth="2" />
          <path d="M-3.5,-3.5 L3.5,3.5 M3.5,-3.5 L-3.5,3.5" stroke={C.danger} strokeWidth="2" strokeLinecap="round" />
        </g>
      )}

      {/* recommended pin */}
      {recommended && (
        <g transform={`translate(${rx},${ry})`}>
          <circle r="13" fill={C.orange} opacity="0.18" />
          <circle r="8.5" fill={C.orange} stroke="#fff" strokeWidth="2" />
          <path d="M-3,0 L-1,2.5 L3.5,-2.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {/* victim (pulsing) */}
      <g transform={`translate(${vx},${vy})`}>
        <circle r="8" fill={C.teal} opacity="0.25" style={{ transformOrigin: "center", animation: "pulseRing 1.8s ease-out infinite" }} />
        <circle r="5.5" fill={C.teal} stroke="#fff" strokeWidth="2" />
      </g>

      {/* legend */}
      <g transform={`translate(${PAD - 8}, 14)`} fontSize="9" fontFamily="system-ui" fontWeight="600">
        <circle cx="4" cy="-3" r="4" fill={C.teal} /><text x="12" y="0" fill={C.tealDark}>You</text>
        <circle cx="44" cy="-3" r="4" fill={C.orange} /><text x="52" y="0" fill={C.tealDark}>Has ASV</text>
        <g transform="translate(108,-3)"><circle r="4" fill="#fff" stroke={C.danger} strokeWidth="1.5" /></g>
        <text x="116" y="0" fill={C.tealDark}>No stock</text>
      </g>
    </svg>
  );
}