import React, { useEffect, useState, useCallback } from "react";
import { Loader2, Minus, Plus, Check, RefreshCw, ShieldCheck, AlertTriangle, Building2, Lock, Bed, Search, Tag, Settings } from "lucide-react";
import { useAuth } from "../auth.jsx";
import * as api from "../api.js";
import { C } from "../theme.js";

function agoText(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function tone(vials) {
  if (vials <= 0) return { label: "Out of Stock", tone: "var(--danger)", bg: "var(--danger-pale)" };
  if (vials < 6) return { label: "Low Stock", tone: "var(--amber)", bg: "var(--amber-pale)" };
  return { label: "In Stock", tone: "var(--good)", bg: "var(--good-pale)" };
}

export default function Stock() {
  const { user, isAdmin } = useAuth();
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // edits maps hospitalId -> { vials, beds }
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const [flash, setFlash] = useState(null); // id just saved

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.fetchHospitals();
      const list = (data.hospitals || []).sort((a, b) => a.name.localeCompare(b.name));
      setHospitals(list);
      setEdits(Object.fromEntries(list.map((h) => [h.id, { vials: h.vials, beds: h.beds }])));
    } catch (e) {
      setError(e.message || "Could not load hospitals list");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const canEdit = (id) => isAdmin || user?.hospital_id === id;
  const isDirty = (id) => {
    const orig = hospitals.find((h) => h.id === id);
    const curr = edits[id];
    if (!orig || !curr) return false;
    return orig.vials !== curr.vials || orig.beds !== curr.beds;
  };

  const changeVials = (id, val) => {
    setEdits((e) => ({
      ...e,
      [id]: { ...e[id], vials: Math.max(0, val) }
    }));
  };

  const changeBeds = (id, val) => {
    setEdits((e) => ({
      ...e,
      [id]: { ...e[id], beds: Math.max(0, val) }
    }));
  };

  const save = async (h) => {
    setSaving(h.id);
    setError("");
    try {
      const curr = edits[h.id];
      const updated = await api.updateStock(h.id, { vials: curr.vials, beds: curr.beds });
      setHospitals((list) => list.map((x) => (x.id === h.id ? { ...x, ...updated } : x)));
      setFlash(h.id);
      setTimeout(() => setFlash(null), 1800);
    } catch (e) {
      setError(e.message || "Update failed");
    } finally {
      setSaving(null);
    }
  };

  // Filtered hospitals
  const filteredHospitals = hospitals.filter((h) => {
    const matchesSearch = h.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSector = sectorFilter === "all" || h.sector === sectorFilter;
    const matchesTier = tierFilter === "all" || h.tier === tierFilter;
    return matchesSearch && matchesSector && matchesTier;
  });

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "50vh", color: "var(--teal)" }}>
        <Loader2 size={36} className="spin" />
      </div>
    );
  }

  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header section */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: 16
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "var(--dark)", letterSpacing: "-0.5px" }}>
            Antivenom Stock Manager
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--muted)", fontWeight: 500 }}>
            {isAdmin ? (
              <span style={{ color: "var(--teal)", fontWeight: 700 }}>District Admin Console:</span>
            ) : (
              <span>Facility view:</span>
            )}{" "}
            {isAdmin ? "You are authorized to manage stock and beds for all clinics." : "You can manage stock for your own facility; other clinics are read-only."}
          </p>
        </div>
        <button
          onClick={load}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--teal)",
            background: "var(--teal-pale)",
            border: "1px solid rgba(13, 110, 110, 0.1)",
            padding: "10px 18px",
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 14,
            boxShadow: "var(--shadow-sm)",
          }}
          className="card-hover"
        >
          <RefreshCw size={15} /> Refresh Data
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {/* Search Box */}
          <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
            <Search size={18} style={{ position: "absolute", left: 14, top: 15, color: "var(--muted)" }} />
            <input
              className="premium-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search hospitals by name..."
              style={{ paddingLeft: 42 }}
            />
          </div>

          {/* Sector Filter */}
          <div style={{ minWidth: 150 }}>
            <select
              className="premium-select"
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
            >
              <option value="all">All Sectors</option>
              <option value="govt">Government</option>
              <option value="private">Private</option>
            </select>
          </div>

          {/* Tier Filter */}
          <div style={{ minWidth: 160 }}>
            <select
              className="premium-select"
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
            >
              <option value="all">All Facility Tiers</option>
              <option value="tertiary">Tertiary / General</option>
              <option value="dh">District Hospital (DH)</option>
              <option value="ah">Area Hospital (AH)</option>
              <option value="chc">Community Health (CHC)</option>
              <option value="phc">Primary Health (PHC)</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          background: "var(--danger-pale)",
          color: "var(--danger)",
          padding: "12px 16px",
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 10,
          border: "1px solid rgba(190, 50, 38, 0.12)"
        }}>
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {/* Grid of Hospital Cards */}
      {filteredHospitals.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--muted)" }}>
          <Building2 size={36} style={{ color: "var(--teal-light)", marginBottom: 12 }} />
          <div style={{ fontWeight: 700, fontSize: 16 }}>No clinics found matching the filter criteria.</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Clear your query or filters and try again.</div>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: 20
        }}>
          {filteredHospitals.map((h) => {
            const editable = canEdit(h.id);
            const editState = edits[h.id] || { vials: h.vials, beds: h.beds };
            const t = tone(editable ? editState.vials : h.vials);
            const dirty = editable && isDirty(h.id);
            const mine = user?.hospital_id === h.id;

            return (
              <div
                key={h.id}
                className="card card-hover"
                style={{
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  borderColor: mine ? "var(--teal)" : "var(--line)",
                  borderWidth: mine ? 2 : 1,
                  boxShadow: mine ? "0 8px 30px rgba(13, 110, 110, 0.08)" : "var(--shadow-sm)",
                  background: mine ? "linear-gradient(to bottom, #ffffff, var(--teal-pale))" : "var(--card-bg)"
                }}
              >
                {/* Hospital Card Top info */}
                <div>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
                    <div style={{
                      background: t.bg,
                      borderRadius: 12,
                      width: 40,
                      height: 40,
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0
                    }}>
                      <Building2 size={20} style={{ color: t.tone }} />
                    </div>
                    <div className="grow">
                      <div
                        className="truncate"
                        style={{
                          fontWeight: 800,
                          color: "var(--dark)",
                          fontSize: 16,
                          letterSpacing: "-0.2px"
                        }}
                        title={h.name}
                      >
                        {h.name}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--muted)",
                          background: "#ecefef",
                          padding: "2px 6px",
                          borderRadius: 6,
                          textTransform: "uppercase"
                        }}>
                          {h.tier.toUpperCase()}
                        </span>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--muted)",
                          background: "#ecefef",
                          padding: "2px 6px",
                          borderRadius: 6,
                          textTransform: "uppercase"
                        }}>
                          {h.sector === "private" ? "Private" : "Govt"}
                        </span>
                        {h.icu && (
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "var(--good)",
                            background: "var(--good-pale)",
                            padding: "2px 6px",
                            borderRadius: 6
                          }}>
                            ICU Capable
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stock status indicator pill */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
                      Updated {agoText(h.updated_at)}
                    </span>
                    <span style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 800,
                      color: t.tone,
                      background: t.bg,
                      padding: "4px 10px",
                      borderRadius: 20
                    }}>
                      {t.tone === "var(--good)" ? <ShieldCheck size={13} /> : <AlertTriangle size={13} />}
                      {t.label.toUpperCase()}
                    </span>
                  </div>

                  {/* Stock Controls */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                    {/* Vials management */}
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "rgba(0,0,0,0.015)",
                      borderRadius: 14,
                      padding: "10px 14px",
                      border: "1px solid rgba(0,0,0,0.03)"
                    }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>ASV Vials</div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)", marginTop: 2 }}>Antivenom inventory</div>
                      </div>
                      {editable ? (
                        <div className="row" style={{ gap: 6 }}>
                          <button onClick={() => changeVials(h.id, editState.vials - 1)} style={counterBtn}>
                            <Minus size={16} />
                          </button>
                          <input
                            type="number"
                            value={editState.vials}
                            onChange={(e) => changeVials(h.id, parseInt(e.target.value, 10) || 0)}
                            style={counterInput}
                          />
                          <button onClick={() => changeVials(h.id, editState.vials + 1)} style={counterBtn}>
                            <Plus size={16} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)" }}>
                          <span style={{ fontWeight: 800, fontSize: 20, color: "var(--dark)" }}>{h.vials}</span>
                          <Lock size={13} />
                        </div>
                      )}
                    </div>

                    {/* Beds management */}
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "rgba(0,0,0,0.015)",
                      borderRadius: 14,
                      padding: "10px 14px",
                      border: "1px solid rgba(0,0,0,0.03)"
                    }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Emergency Beds</div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)", marginTop: 2 }}>Patient capacity</div>
                      </div>
                      {editable ? (
                        <div className="row" style={{ gap: 6 }}>
                          <button onClick={() => changeBeds(h.id, editState.beds - 1)} style={counterBtn}>
                            <Minus size={16} />
                          </button>
                          <input
                            type="number"
                            value={editState.beds}
                            onChange={(e) => changeBeds(h.id, parseInt(e.target.value, 10) || 0)}
                            style={counterInput}
                          />
                          <button onClick={() => changeBeds(h.id, editState.beds + 1)} style={counterBtn}>
                            <Plus size={16} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)" }}>
                          <span style={{ fontWeight: 800, fontSize: 20, color: "var(--dark)" }}>{h.beds}</span>
                          <Lock size={13} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Save Button / Banner */}
                {editable && (
                  <button
                    onClick={() => save(h)}
                    disabled={saving === h.id || !dirty}
                    style={{
                      width: "100%",
                      height: 44,
                      borderRadius: 12,
                      fontWeight: 700,
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      background: flash === h.id ? "var(--good)" : dirty ? "var(--teal)" : "#eef2f2",
                      color: flash === h.id ? "#fff" : dirty ? "#fff" : "var(--muted)",
                      boxShadow: dirty ? "0 4px 12px rgba(13, 110, 110, 0.15)" : "none",
                      cursor: dirty ? "pointer" : "default"
                    }}
                  >
                    {saving === h.id ? (
                      <Loader2 size={16} className="spin" />
                    ) : flash === h.id ? (
                      <>
                        <Check size={16} /> Live stock updated
                      </>
                    ) : dirty ? (
                      "Save Inventory Changes"
                    ) : (
                      "No changes pending"
                    )}
                  </button>
                )}
                
                {mine && !editable && (
                  <div style={{
                    fontSize: 11,
                    textAlign: "center",
                    fontWeight: 700,
                    color: "var(--teal)",
                    background: "var(--teal-pale)",
                    padding: "4px 8px",
                    borderRadius: 8,
                    marginTop: 6
                  }}>
                    SIGNED-IN FACILITY
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const counterBtn = {
  width: 34,
  height: 34,
  borderRadius: 8,
  background: "var(--teal-pale)",
  color: "var(--teal)",
  display: "grid",
  placeItems: "center",
  border: "1px solid rgba(13, 110, 110, 0.05)"
};

const counterInput = {
  width: 50,
  height: 34,
  textAlign: "center",
  fontWeight: 800,
  fontSize: 16,
  color: "var(--dark)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  background: "#fff"
};
