import React, { useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera, Loader2, AlertTriangle, ShieldAlert, X, RefreshCw,
  ChevronRight, SkipForward, Info,
} from "lucide-react";
import { C, FRAME_BG } from "../theme.js";

const SNAKE_DATABASE = {
  en: {
    "Russell's Viper": {
      commonName: "Russell's Viper",
      scientificName: "Daboia russelii",
      reasoning: [
        "Symmetrical dark brown spots/ovals forming a chain-like pattern along the spine.",
        "Triangular-shaped head distinct from the neck.",
        "Rough, heavily keeled dorsal scales."
      ]
    },
    "Indian Cobra": {
      commonName: "Spectacled Cobra",
      scientificName: "Naja naja",
      reasoning: [
        "Characteristic expanded hood structure.",
        "Spectacle-shaped mark visible on the dorsal side of the hood.",
        "Smooth scales and a rounded nose."
      ]
    },
    "Spectacled Cobra": {
      commonName: "Spectacled Cobra",
      scientificName: "Naja naja",
      reasoning: [
        "Characteristic expanded hood structure.",
        "Spectacle-shaped mark visible on the dorsal side of the hood.",
        "Smooth scales and a rounded nose."
      ]
    },
    "Common Krait": {
      commonName: "Common Krait",
      scientificName: "Bungarus caeruleus",
      reasoning: [
        "Glossy black/dark steel-blue body with thin white crossbars.",
        "Enlarged hexagonal scales along the spine.",
        "Rounded head with eyes showing no visible pupils."
      ]
    },
    "Saw-scaled Viper": {
      commonName: "Saw-scaled Viper",
      scientificName: "Echis carinatus",
      reasoning: [
        "Distinct pear-shaped head with a bird's-foot or arrow-shaped mark.",
        "Rough, keeled side scales pointing downwards.",
        "Wavy light-colored lateral patterns along the flanks."
      ]
    },
    "Indian Rock Python": {
      commonName: "Indian Rock Python",
      scientificName: "Python molurus",
      reasoning: [
        "Large, heavy body with irregular blotched patterns.",
        "Triangular head with a dark lanceolate (arrow-like) mark.",
        "Smooth scales and heat-sensing pits along the lip."
      ]
    },
    "Common Sand Boa": {
      commonName: "Common Sand Boa",
      scientificName: "Eryx conicus",
      reasoning: [
        "Blunt tail tip resembling a second head.",
        "Small eyes on top of the head.",
        "Heavy-bodied with dark brown blotches on a gray-brown base."
      ]
    },
    "Checkered Keelback": {
      commonName: "Checkered Keelback",
      scientificName: "Fowlea piscator",
      reasoning: [
        "Checkered dark spots arranged in rows on an olive/yellow body.",
        "Two distinct black streaks behind the eyes.",
        "Keeled scales and rounded snout."
      ]
    },
    "Indian Rat Snake": {
      commonName: "Indian Rat Snake",
      scientificName: "Ptyas mucosa",
      reasoning: [
        "Slender, long body with large eyes.",
        "Black borders on the tail scales.",
        "Smooth scales with a prominent neck ridge."
      ]
    },
    "Rat Snake": {
      commonName: "Indian Rat Snake",
      scientificName: "Ptyas mucosa",
      reasoning: [
        "Slender, long body with large eyes.",
        "Black borders on the tail scales.",
        "Smooth scales with a prominent neck ridge."
      ]
    }
  },
  te: {
    "Russell's Viper": {
      commonName: "రక్తపింజరి (Russell's Viper)",
      scientificName: "Daboia russelii",
      reasoning: [
        "వెన్నెముక వెంట గొలుసు లాంటి ఆకృతిని ఏర్పరిచే సమరూప ముదురు గోధుమ రంగు మచ్చలు.",
        "మెడ నుండి స్పష్టంగా వేరు చేయబడిన త్రిభుజాకార తల.",
        "గరుకుగా, బలంగా ఉన్న వెనుక పొలుసులు."
      ]
    },
    "Indian Cobra": {
      commonName: "నాగుపాము (Spectacled Cobra)",
      scientificName: "Naja naja",
      reasoning: [
        "విశిష్టమైన విస్తరించిన పడగ నిర్మాణం.",
        "పడగ వెనుక భాగంలో స్పష్టంగా కనిపించే చత్వారం/కళ్లద్దాల గుర్తు.",
        "నునుపైన పొలుసులు మరియు గుండ్రటి ముక్కు."
      ]
    },
    "Spectacled Cobra": {
      commonName: "నాగుపాము (Spectacled Cobra)",
      scientificName: "Naja naja",
      reasoning: [
        "విశిష్టమైన విస్తరించిన పడగ నిర్మాణం.",
        "పడగ వెనుక భాగంలో స్పష్టంగా కనిపించే చత్వారం/కళ్లద్దాల గుర్తు.",
        "నునుపైన పొలుసులు మరియు గుండ్రటి ముక్కు."
      ]
    },
    "Common Krait": {
      commonName: "కట్లపాము (Common Krait)",
      scientificName: "Bungarus caeruleus",
      reasoning: [
        "సన్నని తెల్లటి అడ్డకట్లతో కూడిన నిగనిగలాడే నలుపు/ముదురు ఉక్కు-నీలం శరీరం.",
        "వెన్నెముక వెంట పెద్ద షట్కోణ పొలుసులు.",
        "కనిపించే నల్లటి గుడ్డు లేని కళ్లతో కూడిన గుండ్రటి తల."
      ]
    },
    "Saw-scaled Viper": {
      commonName: "చిన్న పింజరి (Saw-scaled Viper)",
      scientificName: "Echis carinatus",
      reasoning: [
        "పక్షి అడుగు లేదా బాణం ఆకారపు గుర్తుతో కూడిన విశిష్టమైన పియర్ ఆకారపు తల.",
        "క్రిందికి చూపే గరుకు పొలుసులు.",
        "శరీరం వైపులా తరంగాల వంటి లేత రంగు నమూనాలు."
      ]
    },
    "Unidentified": {
      commonName: "గుర్తించబడని జాతి",
      scientificName: "Species incertae sedis",
      reasoning: [
        "సురక్షితమైన గుర్తింపు కోసం అవసరమైన దృశ్య ఆధారాలు తగినంతగా లేవు.",
        "భద్రత-మొదటి ప్రోటోకాల్ వర్తిస్తుంది: అన్ని రకాల కాట్లను విషపూరితంగానే పరిగణించాలి."
      ]
    }
  },
  hi: {
    "Russell's Viper": {
      commonName: "दबोइया / रसेल वाइपर (Russell's Viper)",
      scientificName: "Daboia russelii",
      reasoning: [
        "रीढ़ की हड्डी के साथ चेन जैसी आकृति बनाने वाले सममित गहरे भूरे रंग के धब्बे।",
        "गर्दन से अलग त्रिकोणीय आकार का सिर।",
        "खुरदरे और अत्यधिक उभरे हुए शल्क (Keeled scales)।"
      ]
    },
    "Indian Cobra": {
      commonName: "भारतीय नाग (Spectacled Cobra)",
      scientificName: "Naja naja",
      reasoning: [
        "विशिष्ट फैला हुआ फन (Hood)।",
        "फन के पिछले हिस्से पर चश्मे जैसा दिखने वाला चिन्ह।",
        "चिकने शल्क और गोल थूथन।"
      ]
    },
    "Spectacled Cobra": {
      commonName: "भारतीय नाग (Spectacled Cobra)",
      scientificName: "Naja naja",
      reasoning: [
        "विशिष्ट फैला हुआ फन (Hood)।",
        "फन के पिछले हिस्से पर चश्मे जैसा दिखने वाला चिन्ह।",
        "चिकने शल्क और गोल थूथन।"
      ]
    },
    "Common Krait": {
      commonName: "करैत (Common Krait)",
      scientificName: "Bungarus caeruleus",
      reasoning: [
        "पतली सफेद पट्टियों के साथ चमकदार काला/गहरा स्टील-नीला शरीर।",
        "रीढ़ के साथ बड़े षटकोणीय (Hexagonal) शल्क।",
        "बिना दिखाई देने वाली पुतली वाली आँखों के साथ गोल सिर।"
      ]
    },
    "Saw-scaled Viper": {
      commonName: "फुरसा (Saw-scaled Viper)",
      scientificName: "Echis carinatus",
      reasoning: [
        "पक्षी के पैर या तीर के आकार के निशान वाला विशिष्ट नाशपाती के आकार का सिर।",
        "नीचे की ओर झुके हुए खुरदरे शल्क।",
        "शरीर के किनारों पर लहरदार हल्के रंग के पैटर्न।"
      ]
    },
    "Unidentified": {
      commonName: "अज्ञात प्रजाति",
      scientificName: "Species incertae sedis",
      reasoning: [
        "सुरक्षित पहचान के लिए दृश्य प्रमाण अपर्याप्त हैं।",
        "सुरक्षा-प्रथम प्रोटोकॉल लागू: सभी अज्ञात सांपों के काटने को विषैला ही मानें।"
      ]
    }
  }
};

const REPORT_TEXTS = {
  en: {
    reportTitle: "AI Herpetological Analysis Report",
    metadataTitle: "AI-Assisted Emergency Screening Summary",
    commonName: "Common Name",
    scientificName: "Scientific Name",
    venomous: "Venomous (High Risk)",
    nonVenomous: "Non-Venomous (Low Risk)",
    confidence: "AI Confidence Score",
    validationStatus: "Validation Status",
    observations: "Diagnostic Observations",
    validated: "Validated - Meets Emergency Confidence Threshold (>= 60%)",
    fallbackActive: "Fallback Active - Safety Protocols Applied",
    disclaimerTitle: "Medical Protocol & Disclaimer",
    disclaimerBody: "This is an AI-assisted screening tool, not a clinical diagnosis. Treatment decisions must always be based on clinical symptoms and direct medical assessment. Polyvalent antivenom in India covers the four major venomous species (Spectacled Cobra, Common Krait, Russell's Viper, Saw-scaled Viper). In the presence of systemic envenomation symptoms, initiate standard ASV protocols immediately.",
    unidentified: "Unidentified",
    lowConfidence: "Low confidence / Unverified",
    failed: "Process failed",
    unverifiedText: "Safety protocol active: Below confidence threshold (< 60%) or image unprocessable"
  },
  te: {
    reportTitle: "AI హెర్పెటాలాజికల్ విశ్లేషణ నివేదిక",
    metadataTitle: "AI-సహాయక అత్యవసర స్క్రీనింగ్ సారాంశం",
    commonName: "సాధారణ పేరు",
    scientificName: "శాస్త్రీయ నామం",
    venomous: "విషపూరితం (అధిక ప్రమాదం)",
    nonVenomous: "విషరహితం (తక్కువ ప్రమాదం)",
    confidence: "AI నమ్మక శాతము",
    validationStatus: "ధ్రువీకరణ స్థితి",
    observations: "నిర్ధారణ పరిశీలనలు",
    validated: "ధృవీకరించబడింది - అత్యవసర నమ్మక పరిమితి సాధించబడింది (>= 60%)",
    fallbackActive: "ప్రత్యామ్నాయం యాక్టివ్ - భద్రతా నియమాలు వర్తించబడ్డాయి",
    disclaimerTitle: "వైద్య ప్రోటోకాల్ & నిరాకరణ",
    disclaimerBody: "ఇది AI-సహాయక స్క్రీనింగ్ సాధనం మాత్రమే, క్లినికల్ నిర్ధారణ కాదు. చికిత్స నిర్ణయాలు ఎల్లప్పుడూ క్లినికల్ లక్షణాలు మరియు ప్రత్యక్ష వైద్య అంచనాపై ఆధారపడి ఉండాలి. భారతదేశంలో లభించే యాంటీవెనమ్ (ASV) పాలీవేలెంట్ - ఇది నాలుగు ప్రధాన విషపూరిత పాములకు (నాగుపాము, కట్లపాము, రక్తపింజరి, చిన్న పింజరి) పనిచేస్తుంది. శారీరక విష లక్షణాలు కనిపించిన వెంటనే ప్రామాణిక ASV ప్రోటోకాల్స్ ప్రారంభించండి.",
    unidentified: "గుర్తించబడలేదు",
    lowConfidence: "తక్కువ నమ్మకం / ధృవీకరించబడలేదు",
    failed: "ప్రక్రియ విఫలమైంది",
    unverifiedText: "భద్రతా నియమాలు యాక్టివ్: నమ్మక శాతం తక్కువగా ఉంది (< 60%) లేదా చిత్రం ప్రాసెస్ కాలేదు"
  },
  hi: {
    reportTitle: "एआई हर्पेटोलॉजिकल विश्लेषण रिपोर्ट",
    metadataTitle: "एआई-सहायता प्राप्त आपातकालीन स्क्रीनिंग सारांश",
    commonName: "सामान्य नाम",
    scientificName: "वैज्ञानिक नाम",
    venomous: "विषैला (उच्च जोखिम)",
    nonVenomous: "गैर-विषैला (कम जोखिम)",
    confidence: "एआई विश्वास स्कोर",
    validationStatus: "सत्यापन स्थिति",
    observations: "नैदानिक अवलोकन",
    validated: "सत्यापित - आपातकालीन विश्वास सीमा पूर्ण (>= 60%)",
    fallbackActive: "फ़ॉलबैक सक्रिय - सुरक्षा प्रोटोकॉल लागू",
    disclaimerTitle: "चिकित्सा प्रोटोकॉल और अस्वीकरण",
    disclaimerBody: "यह एक एआई-सहायता प्राप्त स्क्रीनिंग टूल है, न कि नैदानिक निदान। उपचार के निर्णय हमेशा नैदानिक लक्षणों और प्रत्यक्ष चिकित्सा मूल्यांकन पर आधारित होने चाहिए। भारत में पॉलीवैलेंट एंटीवेनम चार प्रमुख विषैले साँपों (नाग, करैत, रसेल वाइपर, फुरसा) को कवर करता है। किसी भी प्रणालीगत लक्षण के विकसित होने पर तुरंत मानक एएसवी प्रोटोकॉल शुरू करें।",
    unidentified: "अज्‍ज्ञात",
    lowConfidence: "कम विश्वास / असत्यापित",
    failed: "प्रक्रिया विफल",
    unverifiedText: "सुरक्षा प्रोटोकॉल सक्रिय: विश्वास सीमा से कम (< 60%) या छवि संसाधित नहीं हो सकी"
  }
};

import { tFor } from "../i18n.js";
import { useEmergency } from "../context/EmergencyContext.jsx";
import { identifySnake } from "../lib/api.js";

/**
 * Snake capture (§2.3) — OPTIONAL, never blocks the emergency flow.
 *
 * Framed as "AI-assisted image analysis, not a diagnosis." The hero of the app
 * is emergency response, not species ID, so this screen always offers Skip and
 * always falls back to the safe default: assume venomous. The /api/identify
 * call (and its safe fallback) lives in src/lib/api.js.
 *
 * Writes ONLY the `snake` slice of EmergencyContext.
 */

/** Below this the model is "unsure" — we refuse to name a species. */
const LOW_CONFIDENCE = 0.6;

export default function Snake() {
  const navigate = useNavigate();
  const { language, setSnake } = useEmergency();
  const t = tFor(language);
  const fileRef = useRef(null);

  // All UI state — the image preview never enters context (keeps state light).
  const [status, setStatus] = useState("idle"); // idle | analyzing | result
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState(false);

  const onFile = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // allow re-selecting the same file
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result;
        setPreview(dataUrl);
        setStatus("analyzing");
        const r = await identifySnake(dataUrl);
        const { _failed, ...snake } = r;
        setSnake(snake); // write ONLY the snake slice
        setResult(snake);
        setFailed(_failed);
        setStatus("result");
      };
      reader.readAsDataURL(file);
    },
    [setSnake]
  );

  const clearPhoto = useCallback(() => {
    setPreview(null);
    setResult(null);
    setFailed(false);
    setStatus("idle");
    setSnake(null);
  }, [setSnake]);

  const isConfident =
    result && result.confidence >= LOW_CONFIDENCE && result.species !== "Unidentified";

  // Fallback framing — derived ONLY from the existing API response (the `_failed`
  // transport flag + the returned confidence). No backend change: we surface the
  // single honest reason we can actually detect, never an invented one.
  const fbConfidencePct = Math.round((result?.confidence || 0) * 100);
  const fbReason = failed
    ? t.snake.fallback.reasons.failed
    : result?.confidence > 0
    ? t.snake.fallback.reasons.lowConfidence
    : t.snake.fallback.reasons.unverified;

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      {/* Hidden capture input — camera on mobile, gallery on desktop. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* ── Title + framing ────────────────────────────────────── */}
      <div className="flex items-start gap-2">
        <Camera size={20} style={{ color: C.teal }} className="shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold leading-tight" style={{ color: C.dark }}>
            {t.snake.title}
          </h1>
          <p className="text-xs leading-snug" style={{ color: C.muted }}>
            {t.snake.subtitle}
          </p>
        </div>
      </div>

      {/* ── Capture / preview ──────────────────────────────────── */}
      {status === "idle" && (
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 py-8 active:scale-[.99] transition-transform"
          style={{ borderColor: "#C5DBD9", background: "#fff" }}
        >
          <span className="rounded-full p-3" style={{ background: C.tealPale }}>
            <Camera size={26} style={{ color: C.teal }} />
          </span>
          <span className="text-sm font-bold" style={{ color: C.teal }}>
            {t.snake.take}
          </span>
        </button>
      )}

      {(status === "analyzing" || status === "result") && preview && (
        <div className="rounded-2xl overflow-hidden border relative" style={{ borderColor: "#E1EAE9" }}>
          <img
            src={preview}
            alt={t.snake.title}
            className="w-full object-cover"
            style={{ maxHeight: 200 }}
          />
          {status === "result" && (
            <button
              onClick={clearPhoto}
              aria-label={t.snake.retake}
              className="absolute top-2 right-2 rounded-full p-1.5"
              style={{ background: "rgba(20,40,38,.6)", color: "#fff" }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* ── ANALYZING (loading) ────────────────────────────────── */}
      {status === "analyzing" && (
        <div
          className="rounded-2xl bg-white border px-4 py-4 flex items-center gap-3"
          style={{ borderColor: "#E1EAE9" }}
        >
          <span className="ap-spin inline-flex" style={{ color: C.teal }}>
            <Loader2 size={20} />
          </span>
          <span className="text-sm font-semibold" style={{ color: C.dark }}>
            {t.snake.analyzing}
          </span>
        </div>
      )}

      {/* ── RESULT (Unified Medical Report Card) ────────────────── */}
      {status === "result" && result && (() => {
        const texts = REPORT_TEXTS[language] || REPORT_TEXTS.te;
        const speciesKey = result ? result.species : "Unidentified";
        const langDb = SNAKE_DATABASE[language] || SNAKE_DATABASE.te;
        
        let snakeDetails = null;
        if (result) {
          const key = Object.keys(langDb).find(
            k => k.toLowerCase() === speciesKey.trim().toLowerCase()
          );
          if (key) {
            snakeDetails = langDb[key];
          }
        }
        
        if (!snakeDetails) {
          snakeDetails = {
            commonName: result && result.species !== "Unidentified" ? result.species : texts.unidentified,
            scientificName: result && result.species !== "Unidentified" ? "Species incertae sedis" : "N/A",
            reasoning: failed
              ? [texts.failed, t.snake.fallback.reasons.failed]
              : result && result.confidence > 0
              ? [
                  texts.lowConfidence,
                  t.snake.fallback.reasons.lowConfidence,
                  texts.unverifiedText
                ]
              : [
                  texts.unidentified,
                  t.snake.fallback.reasons.unverified,
                  texts.unverifiedText
                ]
          };
        }

        return (
          <div 
            className="rounded-2xl border bg-white p-4 flex flex-col gap-4 shadow-sm"
            style={{ borderColor: "#C5DBD9" }}
          >
            {/* Report Header */}
            <div className="flex items-center gap-2 pb-3 border-b" style={{ borderColor: "#E1EAE9" }}>
              <div className="rounded-lg p-2 shrink-0" style={{ background: C.tealPale }}>
                <Camera size={20} style={{ color: C.teal }} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: C.teal }}>
                  {texts.reportTitle}
                </div>
                <div className="text-[10px] leading-tight" style={{ color: C.muted }}>
                  {texts.metadataTitle} • {new Date().toLocaleDateString(language === "en" ? "en-US" : language === "hi" ? "hi-IN" : "te-IN")}
                </div>
              </div>
            </div>

            {/* Card 1: Species Summary */}
            <div className="rounded-xl border p-3.5 flex flex-col gap-2" style={{ borderColor: "#E1EAE9", background: FRAME_BG }}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                    {texts.commonName}
                  </div>
                  <div className="text-base font-extrabold leading-tight break-words" style={{ color: C.dark }}>
                    {snakeDetails.commonName}
                  </div>
                </div>
                
                {/* Venomous / Non-Venomous Badge */}
                <span
                  className="text-[10px] font-extrabold rounded-full px-2.5 py-1 flex items-center gap-1 shrink-0 shadow-sm"
                  style={{
                    background: result.venomous ? C.dangerPale : C.goodPale,
                    color: result.venomous ? C.danger : C.good,
                    border: `1px solid ${result.venomous ? "#F0CFC9" : "#CBE7DB"}`
                  }}
                >
                  <AlertTriangle size={10} />
                  {result.venomous ? texts.venomous : texts.nonVenomous}
                </span>
              </div>

              <div className="mt-1">
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                  {texts.scientificName}
                </div>
                <div className="text-xs font-semibold italic" style={{ color: C.tealDark }}>
                  {snakeDetails.scientificName}
                </div>
              </div>
            </div>

            {/* Card 2: Diagnostics & Confidence */}
            <div className="rounded-xl border p-3.5 flex flex-col gap-3" style={{ borderColor: "#E1EAE9" }}>
              {/* Confidence Progress Bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: C.muted }}>
                  <span className="font-bold">{texts.confidence}</span>
                  <span className="font-extrabold tabular-nums" style={{ color: isConfident ? C.teal : C.danger }}>
                    {fbConfidencePct}%
                  </span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "#E8F0EF" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ 
                      width: `${fbConfidencePct}%`, 
                      background: isConfident ? C.teal : C.danger 
                    }}
                  />
                </div>
                {!isConfident && (
                  <div className="text-[10px] mt-1 font-medium" style={{ color: C.danger }}>
                    * {t.snake.fallback.belowThreshold}
                  </div>
                )}
              </div>

              {/* Validation Status */}
              <div className="pt-2.5 border-t" style={{ borderColor: "#E1EAE9" }}>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: C.muted }}>
                  {texts.validationStatus}
                </div>
                <div 
                  className="text-xs font-bold rounded-lg p-2 flex items-center gap-2"
                  style={{
                    background: isConfident ? C.goodPale : C.dangerPale,
                    color: isConfident ? C.good : C.danger,
                    border: `1px solid ${isConfident ? "#CBE7DB" : "#F0CFC9"}`
                  }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: isConfident ? C.good : C.danger }} />
                  <span className="leading-tight">
                    {isConfident ? texts.validated : texts.fallbackActive}
                  </span>
                </div>
              </div>

              {/* Diagnostic Observations */}
              <div className="pt-2.5 border-t" style={{ borderColor: "#E1EAE9" }}>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: C.muted }}>
                  {texts.observations}
                </div>
                <ul className="flex flex-col gap-1.5 list-none pl-0 m-0">
                  {snakeDetails.reasoning.map((item, idx) => (
                    <li key={idx} className="text-xs leading-snug flex items-start gap-2" style={{ color: C.dark }}>
                      <span className="text-[14px] leading-none shrink-0" style={{ color: isConfident ? C.teal : C.danger }}>•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Numbered Medical Guidance (Shown when fallback is active) */}
            {!isConfident && (
              <div className="rounded-xl border p-3.5 flex flex-col gap-2" style={{ borderColor: "#E1EAE9" }}>
                <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: C.dark }}>
                  {t.snake.fallback.whatToDo}
                </div>
                <ol className="flex flex-col gap-2 pl-0 m-0 list-none">
                  {t.snake.fallback.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs leading-snug" style={{ color: C.dark }}>
                      <span
                        className="flex items-center justify-center rounded-full shrink-0 font-bold text-white text-[10px]"
                        style={{ width: 16, height: 16, background: C.danger }}
                      >
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Card 3: Medical Protocol & Disclaimer */}
            <div 
              className="rounded-xl p-3.5 flex flex-col gap-1.5 border" 
              style={{ 
                background: C.tealPale, 
                borderColor: "#C5DBD9",
                color: C.tealDark 
              }}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Info size={12} style={{ color: C.teal }} />
                {texts.disclaimerTitle}
              </div>
              <div className="text-[11px] leading-relaxed" style={{ color: C.muted }}>
                {texts.disclaimerBody}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Don't chase the snake (reused routing strings) ─────── */}
      <div className="rounded-2xl px-4 py-3 flex items-start gap-3" style={{ background: C.tealPale }}>
        <AlertTriangle size={18} style={{ color: C.teal }} className="shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-bold" style={{ color: C.tealDark }}>
            {t.dontChase}
          </div>
          <div className="text-xs leading-snug mt-0.5" style={{ color: C.muted }}>
            {t.dontChaseBody}
          </div>
        </div>
      </div>

      {/* Safety-first note. */}
      <p className="text-xs leading-snug" style={{ color: C.muted }}>
        {t.snake.safetyFirst}
      </p>

      {/* ── CTAs — photo never blocks the flow ─────────────────── */}
      <div className="flex flex-col gap-2 pt-1">
        <button
          onClick={() => navigate("/tracker")}
          className="w-full rounded-xl text-white font-bold flex items-center justify-center gap-2 active:scale-[.98] transition-transform"
          style={{ background: C.teal, height: 54, fontSize: 16 }}
        >
          {t.snake.continueTracker}
          <ChevronRight size={18} />
        </button>

        {status === "result" ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-xl border font-semibold flex items-center justify-center gap-2 active:scale-[.98] transition-transform"
            style={{ borderColor: C.teal, color: C.teal, height: 50, fontSize: 15, background: "#fff" }}
          >
            <RefreshCw size={16} />
            {t.snake.retake}
          </button>
        ) : (
          <button
            onClick={() => navigate("/tracker")}
            className="w-full rounded-xl border font-semibold flex items-center justify-center gap-2 active:scale-[.98] transition-transform"
            style={{ borderColor: "#D7E3E2", color: C.muted, height: 50, fontSize: 15, background: "#fff" }}
          >
            <SkipForward size={16} />
            {t.snake.skip}
          </button>
        )}
      </div>
    </div>
  );
}
