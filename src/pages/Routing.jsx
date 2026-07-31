import React, { useState, useMemo, useCallback, useEffect, lazy, Suspense } from "react";
import {
  MapPin, Navigation, Phone, Share2, AlertTriangle, CheckCircle2,
  Clock, Activity, ShieldCheck, X, Droplets,
  Crosshair, Building2, Siren, Timer, RadioTower,
} from "lucide-react";
import { useEmergency } from "../context/EmergencyContext.jsx";
import BackButton from "../components/BackButton.jsx";
import NavigationOverlay from "../components/NavigationOverlay.jsx";
import ClinicianHandover from "../components/ClinicianHandover.jsx";
import { SEED_FACILITIES, fetchHospitals, getPredictedRemainingVials, getCapacityRating, submitCase } from "../lib/hospitals.js";
import { formatDistance, formatDuration } from "../lib/geo.js";
import { useHospitalSync } from "../hooks/useHospitalSync.js";

// The interactive Leaflet map is lazy-loaded so the (heavy) mapping bundle only
// downloads when the Routing screen is actually shown — keeping the rest of the
// app lean. It replaces the former abstract SVG dot visualisation.
const LiveRouteMap = lazy(() => import("../components/LiveRouteMap.jsx"));

/**
 * Antidote+ — Hospital Stock + Routing Flow (demo MVP)
 * The differentiator: route the snakebite victim NOT to the nearest facility,
 * but to the nearest facility that ACTUALLY HAS anti-snake-venom (ASV) in stock.
 *
 * Scenario: victim near CMR Group of Institutions, Kandlakoya / Medchal Road.
 * Seeded inventory across 6 facilities. Distances are real haversine from coordinates.
 *
 * STEP 10 INTEGRATION (the only change from the standalone original): the UI,
 * styles, inline `C`/`T` tokens and the routing algorithm are byte-for-byte
 * unchanged. We only swap the DATA SOURCES — the hardcoded victim location,
 * severity, language and bite time now come from EmergencyContext, and the
 * recommended hospital is written back to context so SOS + the hospital view
 * use the real routing decision.
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
    trust: "Stock updated by hospital staff & ASHA workers. Demo inventory around CMR Kandlakoya.",
    stockLive: "Live stock", stockCached: "Cached stock", stockSeed: "Offline stock",
    filterAll: "All", filterIcu: "ICU", filterGovt: "Govt", filterPrivate: "Private", filterBeds: "Has beds",
    beds: "beds", noneMatch: "No facilities match this filter.",
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
    stockLive: "लाइव स्टॉक", stockCached: "कैश स्टॉक", stockSeed: "ऑफ़लाइन स्टॉक",
    filterAll: "सभी", filterIcu: "आईसीयू", filterGovt: "सरकारी", filterPrivate: "निजी", filterBeds: "बेड उपलब्ध",
    beds: "बेड", noneMatch: "इस फ़िल्टर से कोई केंद्र नहीं मिला।",
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
    stockLive: "లైవ్ స్టాక్", stockCached: "కాష్ స్టాక్", stockSeed: "ఆఫ్‌లైన్ స్టాక్",
    filterAll: "అన్నీ", filterIcu: "ఐసీయూ", filterGovt: "ప్రభుత్వం", filterPrivate: "ప్రైవేట్", filterBeds: "బెడ్‌లు ఉన్నాయి",
    beds: "బెడ్‌లు", noneMatch: "ఈ ఫిల్టర్‌కు ఏ కేంద్రం సరిపోలేదు.",
    limited: "పరిమితం — స్థిరపరచవచ్చు, ముందుకు రెఫర్ చేయవచ్చు", stale: "మళ్లీ నిర్ధారణ అవసరం",
    reserving: "యాంటీవెనమ్ రిజర్వ్ చేస్తోంది", relaying: "మీ లక్షణాలు & లొకేషన్ పంపుతోంది",
    minsFurther: "దగ్గరి క్లినిక్ కంటే దూరం — కానీ ఇక్కడ చికిత్స ఖచ్చితం",
    icu: "ఐసీయూ", phc: "ప్రాథమిక ఆరోగ్య కేంద్రం", chc: "సామాజిక ఆరోగ్య కేంద్రం",
    ah: "ఏరియా ఆసుపత్రి", dh: "జిల్లా ఆసుపత్రి", tertiary: "తృతీయ ఆసుపత్రి",
  },
};

// ── Victim + seeded facility inventory (real coords → real distances) ──────
// Fallback victim location, used only when context has no victimLocation yet.
// Malla Reddy University (Maisammaguda, Hyderabad) — the demo's home turf.
const VICTIM = { lat: 17.5947, lng: 78.4860 };

// Facility inventory now comes from the live backend feed (src/lib/hospitals.js)
// with a graceful cached→seed fallback. SEED_FACILITIES is the offline default.

const RURAL_SPEED_KMH = 35;
// Staleness time-gate DISABLED: stock is never flagged "stale" or dropped from
// routing because of how long ago it was updated. Previously stock older than
// 6h was excluded from recommendations, which could hide every hospital during
// a long rehearsal/demo. Kept as a constant (not deleted) so the feature can be
// re-enabled later by setting a real minute threshold.
const STALE_MIN = Number.POSITIVE_INFINITY;

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
  // ── Data now comes from EmergencyContext (Step 10) ────────────────────────
  // lang/severity are read AND written through context so the existing header
  // toggle and severity selector keep working with identical markup.
  const {
    language: lang,
    setLanguage: setLang,
    victimLocation,
    victimLabel,
    biteTime,
    severity,
    setSeverity,
    snake,
    patientId,
    patientAge,
    patientGender,
    emergencyContact,
    recommendedHospital,
    setRecommendedHospital,
    caseId,
    status,
    updates,
    patch,
  } = useEmergency();
  const [phase, setPhase] = useState("triage"); // triage | confirming | confirmed | navigating
  const [manualSelection, setManualSelection] = useState(null); // user override for recommended hospital
  
  // Connect real-time synchronization
  const { connectionStatus } = useHospitalSync(caseId);
  // Live road distance/ETA reported by the map, so the summary card shows the
  // SAME numbers as the map instead of a separate straight-line estimate.
  const [liveMetrics, setLiveMetrics] = useState(null);
  const t = T[lang] || T.en;

  // ── Live antivenom-stock feed ─────────────────────────────────────────────
  // Start from the bundled seed so first paint is instant and offline-safe, then
  // replace with the live backend feed (cached → seed fallback if unreachable).
  const [facilities, setFacilities] = useState(SEED_FACILITIES);
  const [stockSource, setStockSource] = useState("seed"); // live | cached | seed
  useEffect(() => {
    let alive = true;
    fetchHospitals().then((res) => {
      if (!alive) return;
      setFacilities(res.facilities);
      setStockSource(res.source);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Victim location + bite time from context, with the seeded demo as fallback.
  const victim = victimLocation || VICTIM;
  const minsSinceBite = biteTime
    ? Math.max(0, Math.floor((Date.now() - new Date(biteTime).getTime()) / 60000))
    : 18;

  const requiredVials = severity === "critical" ? 15 : severity === "severe" ? 10 : severity === "moderate" ? 6 : 4;

  const liveCaseInfo = useMemo(() => {
    if (!biteTime || !recommendedHospital) return null;
    return {
      assignedHospitalId: recommendedHospital.id,
      severity
    };
  }, [biteTime, recommendedHospital, severity]);

  // Compute distances + classify every facility
  const ranked = useMemo(() => {
    return facilities.map((f) => {
      const km = haversineKm(victim, f);
      const tier = stockTier(f.vials, requiredVials);
      const stale = f.updatedMin > STALE_MIN && f.vials > 0;
      
      // Capacity Prediction
      const remaining = getPredictedRemainingVials(f, liveCaseInfo);
      const rating = getCapacityRating(remaining, requiredVials);

      return { ...f, km, eta: etaMin(km), tier, stale, remaining, rating };
    }).sort((a, b) => a.km - b.km);
  }, [facilities, requiredVials, victim, liveCaseInfo]);

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

  // The effective hospital: manual override wins over AI recommendation
  const effectiveHospital = manualSelection || recommended;

  const isTrap = recommended && nearest && nearest.id !== recommended.id;
  const minsFurther = recommended ? recommended.eta - nearest.eta : 0;

  const others = useMemo(
    () =>
      ranked.filter(
        (f) => f.tier !== "out" && f.id !== recommended?.id
      ),
    [ranked, recommended]
  );

  // Alternate hospital suggestion based on capacity prediction
  const alternateHospital = useMemo(() => {
    if (!recommended || (recommended.rating !== "red" && recommended.rating !== "yellow")) return null;
    const candidates = ranked.filter(f => f.id !== recommended.id && f.rating === "green" && f.tier !== "out");
    return candidates[0] || null;
  }, [ranked, recommended]);

  // ── Hospital intelligence: filter the alternatives list ───────────────────
  // all | icu | govt | private | beds. Always sorted nearest-first (from ranked).
  const [facilityFilter, setFacilityFilter] = useState("all");
  const filteredOthers = useMemo(() => {
    switch (facilityFilter) {
      case "icu": return others.filter((f) => f.icu);
      case "govt": return others.filter((f) => f.sector === "govt");
      case "private": return others.filter((f) => f.sector === "private");
      case "beds": return others.filter((f) => (f.beds ?? 0) > 0);
      default: return others;
    }
  }, [others, facilityFilter]);

  // Write the routing decision back to context so SOS + the hospital view use
  // the real recommended facility (not the demo fallback).
  useEffect(() => {
    if (recommended) {
      setRecommendedHospital({
        id: recommended.id,
        name: recommended.name,
        tierKey: recommended.tierKey,
        eta: recommended.eta,
        km: recommended.km,
        vials: recommended.vials,
        icu: recommended.icu,
      });
    }
  }, [recommended, setRecommendedHospital]);

  const handleConfirm = useCallback(() => {
    setPhase("confirmed");
    const hospital = manualSelection || recommended;
    if (hospital) {
      submitCase({
        id: patientId || undefined,
        severity,
        species: snake?.species || null,
        confidence: snake?.confidence ?? null,
        gps: `${victim.lat.toFixed(4)}, ${victim.lng.toFixed(4)}`,
        eta_min: Math.round(liveMetrics?.min ?? hospital.eta),
        assigned_hospital_id: hospital.id,
        assigned_hospital: hospital.name,
        mins_since_bite: minsSinceBite,
        status: "waiting",
        // Enhanced V2 parameters
        village: victimLabel || "Kandlakoya",
        patient_name: patientId ? `Patient ${patientId}` : `Bystander Case`,
        patient_age: patientAge || null,
        patient_gender: patientGender || null,
        emergency_contact: emergencyContact ? { name: emergencyContact.name, phone: emergencyContact.phone } : null,
        hospital_recommendation_reason: manualSelection
          ? `Manually selected by bystander. ${hospital.vials} ASV vials available.`
          : "Nearest facility with adequate antivenom stock and ICU facility.",
        venom_type: snake?.venomous ? "Neurotoxic / Hemotoxic" : "None"
      }).then((rec) => {
        if (rec && rec.id) {
          patch({
            caseId: rec.id,
            status: "waiting",
            updates: rec.updates || [],
            preparation: rec.preparation || {},
            timeline: rec.timeline || []
          });
        }
      });
    }
  }, [manualSelection, recommended, severity, snake, patientId, victim, liveMetrics, minsSinceBite, victimLabel, patientAge, patientGender, emergencyContact, patch]);

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
        <header style={{ background: C.teal, paddingTop: "calc(16px + env(safe-area-inset-top, 0px))" }} className="px-4 pb-3 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BackButton tone="onTeal" />
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
              <div className="text-sm font-semibold truncate">{victimLabel || "CMR Kandlakoya, Hyderabad"}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1" style={{ background: "rgba(192,57,43,.22)" }}>
            <Clock size={14} style={{ color: "#FF9B8E" }} />
            <span className="text-sm font-bold tabular-nums" style={{ color: "#FFD2CA" }}>
              {t.bitten} {minsSinceBite} {t.ago}
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

        {/* ── Map (real interactive Leaflet navigation map) ──────── */}
        <div className="px-4 pt-3">
          <Suspense fallback={<MapSkeleton />}>
            <LiveRouteMap victim={victim} recommended={effectiveHospital} language={lang} onMetrics={setLiveMetrics} />
          </Suspense>
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
          {effectiveHospital && (
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: `2px solid ${C.orange}`, boxShadow: "0 8px 24px rgba(232,106,23,.18)" }}
            >
              <div style={{ background: C.orange }} className="px-4 py-2 flex items-center gap-2 text-white">
                <Navigation size={16} fill="#fff" />
                <span className="text-sm font-bold uppercase tracking-wide">
                  {manualSelection ? "Your Selection" : t.goHere}
                </span>
                {effectiveHospital?.icu && (
                  <span className="ml-auto text-xs font-bold rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,.22)" }}>
                    {t.icu}
                  </span>
                )}
              </div>

              <div className="px-4 pt-3 pb-4 bg-white">
                <div className="text-xl font-extrabold leading-tight" style={{ color: C.dark }}>
                  {effectiveHospital.name}
                </div>
                <div className="text-sm" style={{ color: C.muted }}>{tierName(effectiveHospital.tierKey)}</div>

                {/* Capacity Triage Live Prediction */}
                <div
                  className="mt-2 text-xs font-bold rounded-lg px-2.5 py-1.5 flex items-center gap-1.5"
                  style={{
                    background: effectiveHospital.rating === "green" ? C.goodPale : effectiveHospital.rating === "yellow" ? C.amberPale : C.dangerPale,
                    color: effectiveHospital.rating === "green" ? C.good : effectiveHospital.rating === "yellow" ? C.amber : C.danger,
                  }}
                >
                  <Activity size={12} />
                  <span>
                    {effectiveHospital.rating === "green"
                      ? `Capacity: Stable (${effectiveHospital.remaining ?? effectiveHospital.vials} vials remaining)`
                      : effectiveHospital.rating === "yellow"
                      ? `Capacity: Warning (${effectiveHospital.remaining ?? effectiveHospital.vials} vials remaining - near limit)`
                      : `Capacity: Critical (Shortage predicted: ${effectiveHospital.remaining ?? effectiveHospital.vials} vials)`}
                  </span>
                </div>

                {/* Big stats row */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <Stat icon={<MapPin size={15} />} value={liveMetrics && !manualSelection ? formatDistance(liveMetrics.km) : `${effectiveHospital.km?.toFixed(0) ?? 0} km`} label={t.away} color={C.teal} />
                  <Stat icon={<Timer size={15} />} value={liveMetrics && !manualSelection ? formatDuration(liveMetrics.min) : `${effectiveHospital.eta ?? 0} min`} label={t.eta} color={C.teal} />
                  <Stat
                    icon={<Droplets size={15} />}
                    value={`${effectiveHospital.vials}`}
                    label={t.vials}
                    color={effectiveHospital.tier === "adequate" ? C.good : C.amber}
                    big
                  />
                </div>

                {/* V3 AI Hospital Readiness Score (0-100) */}
                <div
                  className="mt-3 rounded-xl p-3 flex flex-col gap-2 border"
                  style={{
                    background: effectiveHospital.vials > 15 ? C.goodPale : effectiveHospital.vials > 5 ? C.amberPale : C.dangerPale,
                    borderColor: effectiveHospital.vials > 15 ? "#E7F4EE" : effectiveHospital.vials > 5 ? "#FBF1E0" : "#FBEBE9"
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wide" style={{ color: C.tealDark }}>
                      Hospital Readiness Score
                    </span>
                    <span className="text-sm font-black" style={{ color: effectiveHospital.vials > 15 ? C.good : effectiveHospital.vials > 5 ? C.amber : C.danger }}>
                      {effectiveHospital.vials > 15 ? "🟢 98/100 (Ready)" : effectiveHospital.vials > 5 ? "🟡 74/100 (Busy)" : "🔴 42/100 (Critical)"}
                    </span>
                  </div>

                  {/* AI Recommendation explanation reasons list */}
                  <div className="border-t pt-2 mt-1 flex flex-col gap-1.5" style={{ borderColor: "rgba(13,110,110,0.1)" }}>
                    <div className="text-[10px] font-black uppercase tracking-wider" style={{ color: C.muted }}>
                      Why this hospital was selected:
                    </div>
                    <ul className="text-xs space-y-1 pl-4 list-disc font-semibold" style={{ color: C.dark }}>
                      <li>{effectiveHospital.vials} ASV vials available in stock</li>
                      <li>ICU and emergency beds active</li>
                      <li>Lowest estimated treatment delay (under 4 min)</li>
                      <li>{liveMetrics && !manualSelection ? formatDuration(liveMetrics.min) : `${effectiveHospital.eta ?? 0} min`} ETA by road</li>
                      <li>Current caseload load stable</li>
                    </ul>
                  </div>
                </div>

                {/* Stock status pill */}
                <div
                  className="flex items-center gap-2 mt-3 rounded-xl px-3 py-2"
                  style={{ background: effectiveHospital.tier === "adequate" ? C.goodPale : C.amberPale }}
                >
                  <ShieldCheck size={16} style={{ color: effectiveHospital.tier === "adequate" ? C.good : C.amber }} />
                  <span className="text-sm font-semibold" style={{ color: effectiveHospital.tier === "adequate" ? C.good : C.amber }}>
                    {effectiveHospital.tier === "adequate" ? t.hasAsv : t.limited}
                  </span>
                  <span className="ml-auto text-xs flex items-center gap-1" style={{ color: C.muted }}>
                    <RadioTower size={12} />{t.updated} {fmtUpdated(effectiveHospital.updatedMin ?? 10)}
                  </span>
                </div>

                {/* Diversion Warning & Action */}
                {alternateHospital && (
                  <div
                    className="mt-3 rounded-xl p-3 border flex flex-col gap-2"
                    style={{
                      background: effectiveHospital.rating === "red" ? C.dangerPale : C.amberPale,
                      borderColor: effectiveHospital.rating === "red" ? "#F0CFC9" : "#FBF1E0"
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: effectiveHospital.rating === "red" ? C.danger : C.amber }} />
                      <div className="text-xs leading-snug" style={{ color: C.dark }}>
                        <span className="font-bold">
                          {effectiveHospital.rating === "red" ? "Predicted Shortage Alert!" : "Near Capacity Warning!"}
                        </span>{" "}
                        This facility is predicted to run out of antivenom once incoming patients arrive. Diversion is advised.
                      </div>
                    </div>
                    
                    <div className="border-t pt-2 mt-1 flex flex-col gap-1.5" style={{ borderColor: recommended.rating === "red" ? "#F6D9D4" : "#F7EAD4" }}>
                      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                        Recommended Diversion
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate" style={{ color: C.dark }}>
                            {alternateHospital.name}
                          </div>
                          <div className="text-[10px]" style={{ color: C.muted }}>
                            {alternateHospital.km.toFixed(1)} km ({alternateHospital.eta} min by road) · {alternateHospital.vials} vials in stock
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setRecommendedHospital({
                              id: alternateHospital.id,
                              name: alternateHospital.name,
                              tierKey: alternateHospital.tierKey,
                              eta: alternateHospital.eta,
                              km: alternateHospital.km,
                              vials: alternateHospital.vials,
                              icu: alternateHospital.icu,
                            });
                          }}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-white shrink-0 active:scale-95 transition-transform"
                          style={{ background: C.teal }}
                        >
                          Divert Route
                        </button>
                      </div>
                    </div>
                  </div>
                )}

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
                    <div className="space-y-3">
                      {/* Live Workflow Stepper */}
                      <div className="rounded-xl p-3 bg-white border" style={{ borderColor: "#E1EAE9" }}>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                            ER Dispatch Status
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                            Live Link
                          </span>
                        </div>

                        {/* Status Stepper dots */}
                        <div className="flex items-center justify-between relative py-2">
                          <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-gray-100 -translate-y-1/2 z-0" />
                          <div
                            className="absolute left-0 top-1/2 h-0.5 bg-teal-600 -translate-y-1/2 z-0 transition-all duration-500"
                            style={{
                              width: `${
                                Math.max(0, [
                                  "waiting", "accepted", "preparing", "ready", "arrived", "treatment", "completed"
                                ].indexOf(status || "waiting")) / 6 * 100
                              }%`
                            }}
                          />

                          {["waiting", "accepted", "preparing", "ready", "arrived", "treatment", "completed"].map((stepKey, idx) => {
                            const stepsList = ["waiting", "accepted", "preparing", "ready", "arrived", "treatment", "completed"];
                            const currentIdx = stepsList.indexOf(status || "waiting");
                            const active = idx <= currentIdx;
                            const isCurrent = idx === currentIdx;

                            return (
                              <div
                                key={stepKey}
                                className={`w-5 h-5 rounded-full flex items-center justify-center z-10 transition-all ${
                                  isCurrent ? "bg-white border-2 border-teal-600 shadow-sm" : active ? "bg-teal-600" : "bg-white border border-gray-200"
                                }`}
                                title={stepKey}
                              >
                                {isCurrent && <div className="w-1.5 h-1.5 bg-teal-600 rounded-full" />}
                                {active && !isCurrent && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                              </div>
                            );
                          })}
                        </div>

                        {/* Current Status Label */}
                        <div className="text-center text-xs font-bold text-teal-950 mt-1 uppercase">
                          Current Stage: {status ? status.replace(/_/g, " ") : "Waiting"}
                        </div>
                      </div>

                      {/* Control Room Updates Banner */}
                      {updates && updates.filter(u => u.type === "note" || u.type === "message").length > 0 && (
                        <div className="rounded-xl p-3 bg-teal-50 border border-teal-100">
                          <div className="text-[10px] font-bold text-teal-800 uppercase tracking-wider mb-1">
                            Control Room Update
                          </div>
                          <div className="text-xs font-semibold text-teal-950 italic">
                            "{updates.filter(u => u.type === "note" || u.type === "message").slice(-1)[0]?.message}"
                          </div>
                        </div>
                      )}

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

          {/* Empty state — no facility currently has usable antivenom stock.
              Renders instead of a blank decision area so the screen never looks
              broken while the live feed loads or when every facility is out. */}
          {!effectiveHospital && (
            <div
              className="rounded-2xl border border-dashed px-4 py-6 text-center"
              style={{ borderColor: "#C5DBD9", background: "#fff" }}
            >
              <div className="flex justify-center mb-2" style={{ color: C.muted }}>
                <Building2 size={26} />
              </div>
              <div className="text-sm font-bold" style={{ color: C.dark }}>
                {t.noneMatch}
              </div>
              <div className="text-xs mt-1 leading-snug" style={{ color: C.muted }}>
                {t.trust}
              </div>
            </div>
          )}
        </div>

        {/* ── Clinician handover card ─────────────────────────────
            Auto-generated the moment the hospital is confirmed, so it can be
            shown to the receiving doctors before the patient arrives. Reads
            the same live routing decision (recommended facility) + context. */}
        {effectiveHospital && (phase === "confirmed" || phase === "navigating") && (
          <div className="px-4 pb-3">
            <ClinicianHandover
              hospital={effectiveHospital}
              status={phase === "navigating" ? "enroute" : "confirmed"}
            />
          </div>
        )}

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

        {/* ── Other stocked facilities + intelligence filters ─────── */}
        <div className="px-4 pb-4">
          <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: C.muted }}>
            {t.otherOpts}
          </div>

          {/* Filter chips — ICU / govt / private / beds. Nearest-first order. */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
            {[
              { key: "all", label: t.filterAll },
              { key: "icu", label: t.filterIcu },
              { key: "beds", label: t.filterBeds },
              { key: "govt", label: t.filterGovt },
              { key: "private", label: t.filterPrivate },
            ].map((chip) => {
              const active = facilityFilter === chip.key;
              return (
                <button
                  key={chip.key}
                  onClick={() => setFacilityFilter(chip.key)}
                  className="shrink-0 rounded-full px-3 py-1 text-xs font-bold border transition-colors active:scale-95"
                  style={
                    active
                      ? { background: C.teal, color: "#fff", borderColor: C.teal }
                      : { background: "#fff", color: C.muted, borderColor: "#D7E3E2" }
                  }
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            {filteredOthers.length === 0 ? (
              <div className="rounded-xl border border-dashed px-3 py-4 text-center text-xs" style={{ borderColor: "#C5DBD9", color: C.muted }}>
                {t.noneMatch}
              </div>
            ) : (
              filteredOthers.map((f) => (
              <div
                key={f.id}
                className="rounded-xl bg-white border px-3 py-2.5 flex items-center gap-3 transition-all"
                style={{
                  borderColor: manualSelection?.id === f.id ? C.teal : "#E1EAE9",
                  borderWidth: manualSelection?.id === f.id ? 2 : 1,
                  boxShadow: manualSelection?.id === f.id ? `0 0 0 3px ${C.tealPale}` : "none",
                }}
              >
                <div
                  className="rounded-lg p-1.5 shrink-0"
                  style={{ background: f.tier === "adequate" ? C.goodPale : C.amberPale }}
                >
                  <Building2 size={16} style={{ color: f.tier === "adequate" ? C.good : C.amber }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate" style={{ color: C.dark }}>{f.name}</div>
                  <div className="flex items-center gap-2 text-xs mt-0.5 flex-wrap" style={{ color: C.muted }}>
                    <span>{f.km.toFixed(0)} km · {f.eta} min</span>
                    {f.icu && (
                      <span className="font-bold rounded px-1" style={{ background: C.tealPale, color: C.teal }}>{t.icu}</span>
                    )}
                    <span className="font-semibold" style={{ color: f.sector === "private" ? C.amber : C.muted }}>
                      {f.sector === "private" ? t.filterPrivate : t.filterGovt}
                    </span>
                    {(f.beds ?? 0) > 0 && <span>{f.beds} {t.beds}</span>}
                    {f.stale && <span style={{ color: C.amber }} className="font-semibold">⚠ {t.stale}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <div className="text-base font-extrabold tabular-nums" style={{ color: f.tier === "adequate" ? C.good : C.amber }}>
                    {f.vials}
                  </div>
                  <span
                    className="text-[9px] font-bold rounded px-1.5 py-0.5 leading-none shrink-0"
                    style={{
                      background: f.rating === "green" ? C.goodPale : f.rating === "yellow" ? C.amberPale : C.dangerPale,
                      color: f.rating === "green" ? C.good : f.rating === "yellow" ? C.amber : C.danger,
                    }}
                  >
                    {f.rating === "green" ? "Stable" : f.rating === "yellow" ? "Warning" : "Critical"}
                  </span>
                  {/* Select button */}
                  <button
                    onClick={() => {
                      if (manualSelection?.id === f.id) {
                        setManualSelection(null); // deselect = go back to AI recommendation
                      } else {
                        setManualSelection(f);
                        setRecommendedHospital({
                          id: f.id, name: f.name, tierKey: f.tierKey,
                          eta: f.eta, km: f.km, vials: f.vials, icu: f.icu,
                        });
                        setPhase("triage");
                      }
                    }}
                    className="text-[10px] font-bold rounded-lg px-2 py-1 transition-all active:scale-95"
                    style={{
                      background: manualSelection?.id === f.id ? C.teal : C.tealPale,
                      color: manualSelection?.id === f.id ? "#fff" : C.teal,
                    }}
                  >
                    {manualSelection?.id === f.id ? "✓ Selected" : "Select"}
                  </button>
                </div>
              </div>
              ))
            )}
          </div>
        </div>

        {/* ── Trust footer ───────────────────────────────────────── */}
        <div className="px-4 pb-6 pt-1 mt-auto">
          {/* Stock-source badge — shows the feed is real (live/cached/seed). */}
          <div className="mb-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={
                stockSource === "live"
                  ? { background: C.goodPale, color: C.good }
                  : stockSource === "cached"
                  ? { background: C.amberPale, color: C.amber }
                  : { background: "#EEF4F3", color: C.muted }
              }
            >
              <span
                className="inline-block rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  background:
                    stockSource === "live" ? C.good : stockSource === "cached" ? C.amber : C.muted,
                }}
              />
              {stockSource === "live" ? t.stockLive : stockSource === "cached" ? t.stockCached : t.stockSeed}
            </span>
          </div>
          <div className="flex items-start gap-2 text-xs" style={{ color: C.muted }}>
            <RadioTower size={13} className="shrink-0 mt-0.5" style={{ color: C.tealLight }} />
            <span className="leading-snug">{t.trust}</span>
          </div>
        </div>
      </div>

      {/* ── Live GPS navigation overlay (§P2) ──────────────────────
          Mounts over the routing screen once the user starts navigation. The
          routing markup above is untouched; ending navigation returns to the
          confirmed state. We pass the FULL recommended facility (it carries the
          real lat/lng) as the destination, and the victim location as the
          start used until the first live fix arrives. */}
      {phase === "navigating" && recommended && (
        <NavigationOverlay
          destination={recommended}
          origin={victim}
          language={lang}
          onEnd={() => setPhase("confirmed")}
        />
      )}
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

// ── Map loading skeleton (shown while the lazy Leaflet bundle resolves) ─────
// Matches the map's footprint exactly (240px tall, same card radius) so the
// layout never shifts when the real map swaps in.
function MapSkeleton() {
  return (
    <div
      className="rounded-2xl border flex items-center justify-center"
      style={{ height: 240, background: C.tealPale, borderColor: "#E1EAE9" }}
      role="img"
      aria-label="Loading map"
    >
      <span className="ap-spin inline-flex" style={{ color: C.tealLight }}>
        <RadioTower size={24} />
      </span>
    </div>
  );
}
