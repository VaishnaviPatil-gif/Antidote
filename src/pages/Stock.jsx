import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Boxes, Droplets, BedDouble, Check, Loader2, RefreshCw,
  ChevronLeft, WifiOff, Pencil, ShieldCheck,
} from "lucide-react";
import { C } from "../theme.js";
import { useEmergency } from "../context/EmergencyContext.jsx";
import { useOnline } from "../hooks/useOnline.js";
import { fetchHospitals, updateStock } from "../lib/hospitals.js";

/**
 * Hospital-staff / ASHA-worker stock console.
 *
 * This is the screen that makes the routing engine's "has antivenom in stock"
 * claim REAL: staff open it, set the current ASV vials (and emergency beds) for
 * their facility, and the update — timestamped server-side — immediately feeds
 * the victim-facing routing. Online-only by nature (it writes to the shared
 * registry); offline it explains why and stays read-only.
 *
 * Kept out of the victim's emergency path (reached from Home → "Hospital staff").
 */

// Self-contained trilingual labels (mirrors the Routing screen's inline table).
const L = {
  en: {
    title: "Hospital stock console",
    subtitle: "Update antivenom & bed availability for your facility.",
    back: "Back",
    vials: "ASV vials", beds: "Emergency beds", icu: "ICU",
    updated: "Updated", ago: "ago", justNow: "just now", min: "min", hr: "hr",
    edit: "Update", save: "Save update", saving: "Saving…", saved: "Stock updated",
    offline: "You're offline — stock updates need a connection.",
    error: "Couldn't save. Check the connection and try again.",
    refresh: "Refresh",
    live: "Live registry", trust: "Updates are timestamped and feed the routing engine instantly.",
    govt: "Govt", private: "Private",
  },
  hi: {
    title: "अस्पताल स्टॉक कंसोल",
    subtitle: "अपने केंद्र के लिए एंटीवेनम व बेड उपलब्धता अपडेट करें।",
    back: "वापस",
    vials: "ASV शीशियाँ", beds: "आपातकालीन बेड", icu: "आईसीयू",
    updated: "अपडेट", ago: "पहले", justNow: "अभी", min: "मिनट", hr: "घंटे",
    edit: "अपडेट करें", save: "सहेजें", saving: "सहेजा जा रहा…", saved: "स्टॉक अपडेट हुआ",
    offline: "आप ऑफ़लाइन हैं — स्टॉक अपडेट के लिए कनेक्शन चाहिए।",
    error: "सहेज नहीं सका। कनेक्शन जाँचें व पुनः प्रयास करें।",
    refresh: "ताज़ा करें",
    live: "लाइव रजिस्ट्री", trust: "अपडेट टाइमस्टैंप के साथ तुरंत रूटिंग में जुड़ते हैं।",
    govt: "सरकारी", private: "निजी",
  },
  te: {
    title: "ఆసుపత్రి స్టాక్ కన్సోల్",
    subtitle: "మీ కేంద్రానికి యాంటీవెనమ్ & బెడ్ లభ్యతను నవీకరించండి.",
    back: "వెనుకకు",
    vials: "ASV సీసాలు", beds: "అత్యవసర బెడ్‌లు", icu: "ఐసీయూ",
    updated: "నవీకరణ", ago: "క్రితం", justNow: "ఇప్పుడే", min: "నిమి", hr: "గం",
    edit: "నవీకరించు", save: "సేవ్ చేయి", saving: "సేవ్ అవుతోంది…", saved: "స్టాక్ నవీకరించబడింది",
    offline: "మీరు ఆఫ్‌లైన్‌లో ఉన్నారు — స్టాక్ నవీకరణకు కనెక్షన్ కావాలి.",
    error: "సేవ్ చేయలేకపోయాం. కనెక్షన్ తనిఖీ చేసి మళ్లీ ప్రయత్నించండి.",
    refresh: "రిఫ్రెష్",
    live: "లైవ్ రిజిస్ట్రీ", trust: "నవీకరణలు టైమ్‌స్టాంప్‌తో వెంటనే రూటింగ్‌కు చేరతాయి.",
    govt: "ప్రభుత్వం", private: "ప్రైవేట్",
  },
};

const fmtAgo = (min, t) => {
  if (min <= 0) return t.justNow;
  if (min < 60) return `${min} ${t.min} ${t.ago}`;
  const hr = (min / 60).toFixed(min % 60 === 0 ? 0 : 1);
  return `${hr} ${t.hr} ${t.ago}`;
};

export default function Stock() {
  const navigate = useNavigate();
  const { language } = useEmergency();
  const online = useOnline();
  const t = L[language] || L.en;

  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [errorId, setErrorId] = useState(null);
  const [draft, setDraft] = useState({ vials: 0, beds: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchHospitals();
    setFacilities(res.facilities);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = useCallback((f) => {
    setEditingId(f.id);
    setSavedId(null);
    setErrorId(null);
    setDraft({ vials: f.vials, beds: f.beds ?? 0 });
  }, []);

  const save = useCallback(
    async (f) => {
      setSavingId(f.id);
      setErrorId(null);

      const vials = Math.max(0, Number(draft.vials) || 0);
      const beds = Math.max(0, Number(draft.beds) || 0);

      if (online) {
        try {
          const updated = await updateStock(f.id, { vials, beds });
          // Reflect the server truth (fresh vials/beds + reset "updated ago").
          setFacilities((prev) =>
            prev.map((x) =>
              x.id === f.id
                ? { ...x, vials: updated.vials, beds: updated.beds, updatedMin: 0, _isOfflineQueued: false }
                : x
            )
          );
          setEditingId(null);
          setSavedId(f.id);
        } catch {
          setErrorId(f.id);
        } finally {
          setSavingId(null);
        }
      } else {
        // Offline flow: update local state immediately and queue sync
        setFacilities((prev) =>
          prev.map((x) =>
            x.id === f.id
              ? { ...x, vials, beds, updatedMin: 0, _isOfflineQueued: true }
              : x
          )
        );

        // Also update local cached registry in IndexedDB so other screens read the new offline value!
        import("../lib/db.js").then(({ idbSet }) => {
          const cacheKey = "antidote:hospitals";
          const updatedList = facilities.map((x) =>
            x.id === f.id ? { ...x, vials, beds, updatedMin: 0 } : x
          );
          idbSet(cacheKey, { facilities: updatedList, updated_at: new Date().toISOString() });
        });

        import("../lib/sync.js").then(({ enqueueAction }) => {
          enqueueAction("UPDATE_STOCK", {
            hospitalId: f.id,
            vials,
            beds
          });
        });

        setEditingId(null);
        setSavedId(f.id);
        setSavingId(null);
      }
    },
    [draft, online, facilities]
  );

  const sorted = useMemo(
    () => [...facilities].sort((a, b) => a.name.localeCompare(b.name)),
    [facilities]
  );

  return (
    <div className="px-4 pt-4 pb-8 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start gap-2">
        <button
          onClick={() => navigate(-1)}
          aria-label={t.back}
          className="rounded-lg p-1.5 shrink-0 active:scale-95 transition-transform"
          style={{ background: C.tealPale }}
        >
          <ChevronLeft size={18} style={{ color: C.teal }} />
        </button>
        <div className="flex items-start gap-2">
          <Boxes size={20} style={{ color: C.teal }} className="shrink-0 mt-0.5" />
          <div>
            <h1 className="text-lg font-extrabold leading-tight" style={{ color: C.dark }}>
              {t.title}
            </h1>
            <p className="text-xs leading-snug" style={{ color: C.muted }}>
              {t.subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* Live-registry badge + refresh */}
      <div className="flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ background: C.goodPale, color: C.good }}
        >
          <span className="inline-block rounded-full" style={{ width: 7, height: 7, background: C.good }} />
          {t.live}
        </span>
        <button
          onClick={load}
          className="flex items-center gap-1 text-xs font-semibold active:scale-95 transition-transform"
          style={{ color: C.teal }}
        >
          <RefreshCw size={13} className={loading ? "ap-spin" : ""} />
          {t.refresh}
        </button>
      </div>

      {/* Offline notice */}
      {!online && (
        <div className="rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ background: C.amberPale }}>
          <WifiOff size={16} style={{ color: C.amber }} className="shrink-0" />
          <span className="text-xs font-medium" style={{ color: C.amber }}>
            {t.offline}
          </span>
        </div>
      )}

      {/* Facility list */}
      {loading ? (
        <div className="flex justify-center py-10">
          <span className="ap-spin inline-flex" style={{ color: C.tealLight }}>
            <Loader2 size={28} />
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sorted.map((f) => {
            const isEditing = editingId === f.id;
            const isSaving = savingId === f.id;
            const isSaved = savedId === f.id;
            const isError = errorId === f.id;
            return (
              <section
                key={f.id}
                className="rounded-2xl bg-white border overflow-hidden"
                style={{ borderColor: isSaved ? C.good : "#E1EAE9" }}
              >
                <div className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate" style={{ color: C.dark }}>
                        {f.name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span
                          className="text-[10px] font-bold rounded-full px-1.5 py-0.5"
                          style={{ background: "#EEF4F3", color: C.muted }}
                        >
                          {f.sector === "private" ? t.private : t.govt}
                        </span>
                        {f.icu && (
                          <span
                            className="text-[10px] font-bold rounded-full px-1.5 py-0.5"
                            style={{ background: C.tealPale, color: C.teal }}
                          >
                            {t.icu}
                          </span>
                        )}
                        <span className="text-[10px]" style={{ color: C.muted }}>
                          {t.updated} {fmtAgo(f.updatedMin, t)} {f._isOfflineQueued && <span style={{ color: C.orange, fontWeight: "bold" }}> (Pending Sync)</span>}
                        </span>
                      </div>
                    </div>
                    {!isEditing && (
                      <button
                        onClick={() => startEdit(f)}
                        className="shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:opacity-40"
                        style={{ background: C.tealPale, color: C.teal }}
                      >
                        <Pencil size={13} />
                        {t.edit}
                      </button>
                    )}
                  </div>

                  {/* Current values (read) */}
                  {!isEditing && (
                    <div className="flex items-center gap-4 mt-2.5">
                      <Stat icon={<Droplets size={15} />} value={f.vials} label={t.vials} tone={f.vials > 0 ? C.good : C.danger} />
                      <Stat icon={<BedDouble size={15} />} value={f.beds ?? 0} label={t.beds} tone={C.teal} />
                      {isSaved && (
                        <span className="ml-auto flex items-center gap-1 text-xs font-bold" style={{ color: C.good }}>
                          <Check size={14} />
                          {t.saved}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Edit form */}
                  {isEditing && (
                    <div className="mt-3 flex flex-col gap-2.5">
                      <div className="grid grid-cols-2 gap-2.5">
                        <NumberField
                          icon={<Droplets size={15} />}
                          label={t.vials}
                          value={draft.vials}
                          onChange={(v) => setDraft((d) => ({ ...d, vials: v }))}
                        />
                        <NumberField
                          icon={<BedDouble size={15} />}
                          label={t.beds}
                          value={draft.beds}
                          onChange={(v) => setDraft((d) => ({ ...d, beds: v }))}
                        />
                      </div>
                      {isError && (
                        <div className="text-xs font-medium" style={{ color: C.danger }}>
                          {t.error}
                        </div>
                      )}
                      <button
                        onClick={() => save(f)}
                        disabled={isSaving}
                        className="w-full rounded-xl text-white font-bold flex items-center justify-center gap-2 active:scale-[.98] transition-transform disabled:opacity-70"
                        style={{ background: C.teal, height: 46, fontSize: 14 }}
                      >
                        {isSaving ? (
                          <>
                            <span className="ap-spin inline-flex"><Loader2 size={16} /></span>
                            {t.saving}
                          </>
                        ) : (
                          <>
                            <Check size={16} />
                            {t.save}
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Trust footer */}
      <div className="flex items-start gap-2 text-xs pt-1" style={{ color: C.muted }}>
        <ShieldCheck size={13} className="shrink-0 mt-0.5" style={{ color: C.tealLight }} />
        <span className="leading-snug">{t.trust}</span>
      </div>
    </div>
  );
}

/* ── Presentational pieces ─────────────────────────────────────────────────── */

function Stat({ icon, value, label, tone }) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ color: tone }}>{icon}</span>
      <span className="font-extrabold text-base tabular-nums" style={{ color: tone }}>
        {value}
      </span>
      <span className="text-[11px]" style={{ color: C.muted }}>{label}</span>
    </div>
  );
}

function NumberField({ icon, label, value, onChange }) {
  return (
    <label className="rounded-xl border px-3 py-2 block" style={{ borderColor: "#D7E3E2", background: "#F8FBFA" }}>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold mb-1" style={{ color: C.muted }}>
        <span style={{ color: C.tealLight }}>{icon}</span>
        {label}
      </span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0))}
        className="w-full text-lg font-extrabold bg-transparent outline-none tabular-nums"
        style={{ color: C.dark }}
      />
    </label>
  );
}
