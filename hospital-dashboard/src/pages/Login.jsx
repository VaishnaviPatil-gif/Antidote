import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldPlus, Loader2, LogIn, AlertCircle, MapPin, Compass, UserPlus, Check } from "lucide-react";
import { useAuth } from "../auth.jsx";
import { C } from "../theme.js";

export default function Login() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("login"); // "login" | "signup"

  // Login fields
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");

  // Signup fields
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [vials, setVials] = useState(10);
  const [beds, setBeds] = useState(5);
  const [tier, setTier] = useState("tertiary");
  const [sector, setSector] = useState("private");
  const [icu, setIcu] = useState(true);

  // States
  const [busy, setBusy] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [error, setError] = useState("");
  const [gpsSuccess, setGpsSuccess] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(loginUser, loginPass);
      navigate("/stock", { replace: true });
    } catch (err) {
      setError(err?.message || "Login failed. Please verify your credentials.");
    } finally {
      setBusy(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    if (!name || !username || !password || lat === "" || lng === "") {
      setError("Please fill in all required fields, including GPS coordinates.");
      return;
    }
    setBusy(true);
    try {
      await signup({
        username,
        password,
        name,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        vials: parseInt(vials, 10) || 0,
        beds: parseInt(beds, 10) || 0,
        tier,
        sector,
        icu,
      });
      navigate("/stock", { replace: true });
    } catch (err) {
      setError(err?.message || "Registration failed. Try a different username.");
    } finally {
      setBusy(false);
    }
  };

  const detectGPS = () => {
    setGpsLoading(true);
    setError("");
    setGpsSuccess(false);
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setGpsLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setGpsLoading(false);
        setGpsSuccess(true);
        setTimeout(() => setGpsSuccess(false), 2000);
      },
      (err) => {
        setError("GPS access denied or unavailable. Please enter coordinates manually.");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const tabStyle = (active) => ({
    flex: 1,
    padding: "12px 10px",
    fontWeight: 700,
    fontSize: 14,
    color: active ? "var(--teal)" : "var(--muted)",
    borderBottom: active ? "3px solid var(--teal)" : "3px solid var(--line)",
    background: active ? "rgba(13, 110, 110, 0.04)" : "none",
    textAlign: "center",
    transition: "all 0.2s",
  });

  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      padding: "20px",
      background: `linear-gradient(145deg, var(--teal-pale) 0%, var(--bg) 100%)`
    }}>
      <div className="card fade" style={{
        width: "100%",
        maxWidth: tab === "login" ? 420 : 560,
        padding: "32px 28px",
        boxShadow: "var(--shadow-lg)",
        background: "var(--card-bg)",
        transition: "max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
      }}>
        {/* Logo/Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{
            background: "linear-gradient(135deg, var(--teal) 0%, var(--teal-light) 100%)",
            width: 46,
            height: 46,
            borderRadius: 14,
            display: "grid",
            placeItems: "center",
            color: "#fff",
            boxShadow: "0 6px 16px rgba(13, 110, 110, 0.25)"
          }}>
            <ShieldPlus size={26} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, color: "var(--dark)", letterSpacing: "-0.5px" }}>Antidote+</div>
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>Hospital Console</div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div style={{ display: "flex", marginBottom: 24, borderRadius: 8, overflow: "hidden" }}>
          <button style={tabStyle(tab === "login")} onClick={() => { setTab("login"); setError(""); }}>
            Sign In
          </button>
          <button style={tabStyle(tab === "signup")} onClick={() => { setTab("signup"); setError(""); }}>
            Register Facility
          </button>
        </div>

        {error && (
          <div className="fade" style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            background: "var(--danger-pale)",
            color: "var(--danger)",
            padding: "12px 14px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 20,
            border: "1px solid rgba(190, 50, 38, 0.15)"
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{error}</div>
          </div>
        )}

        {tab === "login" ? (
          /* LOGIN FORM */
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 4px", lineHeight: 1.5 }}>
              Enter your clinical account credentials to view incoming patients and update live antivenom stock.
            </p>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>Hospital Username</label>
              <input
                className="premium-input"
                value={loginUser}
                autoFocus
                autoCapitalize="none"
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="e.g. mrn"
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>Password</label>
              <input
                className="premium-input"
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={busy || !loginUser || !loginPass}
              style={{
                height: 50,
                borderRadius: 12,
                background: "var(--teal)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: busy || !loginUser || !loginPass ? 0.7 : 1,
                marginTop: 8,
                boxShadow: "0 4px 12px rgba(13, 110, 110, 0.15)"
              }}
            >
              {busy ? <Loader2 size={18} className="spin" /> : <LogIn size={18} />}
              {busy ? "Signing in..." : "Sign in to Dashboard"}
            </button>

            <div style={{
              marginTop: 14,
              paddingTop: 16,
              borderTop: "1px solid var(--line)",
              fontSize: 12,
              color: "var(--muted)",
              lineHeight: 1.6
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--dark)" }}>Demo Logins:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <code style={{ background: "var(--teal-pale)", color: "var(--teal-dark)", padding: "2px 8px", borderRadius: 6 }}>mrn / mrn123</code>
                <code style={{ background: "var(--teal-pale)", color: "var(--teal-dark)", padding: "2px 8px", borderRadius: 6 }}>gandhi / gandhi123</code>
                <code style={{ background: "var(--teal-pale)", color: "var(--teal-dark)", padding: "2px 8px", borderRadius: 6 }}>admin / admin123</code>
              </div>
            </div>
          </form>
        ) : (
          /* SIGNUP FORM */
          <form onSubmit={handleSignup} className="fade" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 4px", lineHeight: 1.5 }}>
              Register a new health facility to join the AI Snakebite Emergency Network. Victims will be routed to you based on your live ASV stock.
            </p>

            {/* Step 1: Credentials */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>Hospital Name</label>
                <input
                  className="premium-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Vikarabad Area Hospital"
                  required
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>Console Username</label>
                <input
                  className="premium-input"
                  value={username}
                  autoCapitalize="none"
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. vikarabad-ah"
                  required
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>Password</label>
                <input
                  className="premium-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {/* Step 2: Location */}
            <div style={{ background: "var(--teal-pale)", padding: 14, borderRadius: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--teal-dark)", display: "flex", alignItems: "center", gap: 5 }}>
                  <MapPin size={14} /> Coordinates for Routing
                </span>
                <button
                  type="button"
                  onClick={detectGPS}
                  disabled={gpsLoading}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#fff",
                    background: gpsSuccess ? "var(--good)" : "var(--teal)",
                    padding: "6px 12px",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {gpsLoading ? <Loader2 size={12} className="spin" /> : gpsSuccess ? <Check size={12} /> : <Compass size={12} />}
                  {gpsLoading ? "Detecting..." : gpsSuccess ? "Detected!" : "Use Current GPS"}
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <input
                    className="premium-input"
                    type="number"
                    step="any"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="Latitude (e.g. 17.52)"
                    style={{ height: 40 }}
                    required
                  />
                </div>
                <div>
                  <input
                    className="premium-input"
                    type="number"
                    step="any"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    placeholder="Longitude (e.g. 78.46)"
                    style={{ height: 40 }}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Step 3: Technical Details */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>Facility Tier</label>
                <select className="premium-select" value={tier} onChange={(e) => setTier(e.target.value)}>
                  <option value="tertiary">Tertiary / General Hospital</option>
                  <option value="dh">District Hospital (DH)</option>
                  <option value="ah">Area Hospital (AH)</option>
                  <option value="chc">Community Health Center (CHC)</option>
                  <option value="phc">Primary Health Center (PHC)</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>Sector</label>
                <select className="premium-select" value={sector} onChange={(e) => setSector(e.target.value)}>
                  <option value="private">Private Facility</option>
                  <option value="govt">Government Facility</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>Initial ASV Stock (Vials)</label>
                <input
                  className="premium-input"
                  type="number"
                  min="0"
                  value={vials}
                  onChange={(e) => setVials(parseInt(e.target.value, 10) || 0)}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>Emergency Beds</label>
                <input
                  className="premium-input"
                  type="number"
                  min="0"
                  value={beds}
                  onChange={(e) => setBeds(parseInt(e.target.value, 10) || 0)}
                />
              </div>
              <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <input
                  type="checkbox"
                  id="icu-checkbox"
                  checked={icu}
                  onChange={(e) => setIcu(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: "var(--teal)", cursor: "pointer" }}
                />
                <label htmlFor="icu-checkbox" style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)", cursor: "pointer" }}>
                  Facility is ICU Capable (contains advanced ventilator support)
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              style={{
                height: 50,
                borderRadius: 12,
                background: "var(--teal)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: busy ? 0.7 : 1,
                marginTop: 8,
                boxShadow: "0 4px 12px rgba(13, 110, 110, 0.15)"
              }}
            >
              {busy ? <Loader2 size={18} className="spin" /> : <UserPlus size={18} />}
              {busy ? "Registering..." : "Register & Start Shift"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
