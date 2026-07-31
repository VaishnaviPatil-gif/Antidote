import React, { useState } from "react";
import { Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import { Boxes, Activity, BarChart3, LogOut, Loader2, ShieldPlus, Bell, Check, Wifi, WifiOff } from "lucide-react";
import { useAuth } from "./auth.jsx";
import { RealtimeProvider, useRealtimeData } from "./RealtimeContext.jsx";
import NotificationPanel from "./components/NotificationPanel.jsx";
import Login from "./pages/Login.jsx";
import Stock from "./pages/Stock.jsx";
import Cases from "./pages/Cases.jsx";
import Analytics from "./pages/Analytics.jsx";

const NAV = [
  { to: "/stock", label: "Antivenom Stock", icon: Boxes },
  { to: "/cases", label: "Emergency Room Feed", icon: Activity },
  { to: "/analytics", label: "Operational Analytics", icon: BarChart3 },
];

function Loading() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--teal-light)" }}>
      <Loader2 size={34} className="spin" />
    </div>
  );
}

function Shell({ children }) {
  const { logout, isAdmin } = useAuth();
  const { notifications, unreadCount, acknowledgeNotification, connectionStatus, acknowledgeAll } = useRealtimeData();
  const [showBellDropdown, setShowBellDropdown] = useState(false);
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* Top Header Command Bar */}
      <header style={{
        background: `linear-gradient(135deg, #052626 0%, #0D6E6E 100%)`,
        color: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 90,
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)"
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "12px 20px", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            width: 44,
            height: 44,
            borderRadius: 14,
            display: "grid",
            placeItems: "center",
            color: "#fff",
            boxShadow: "inset 0 2px 4px rgba(255,255,255,0.1)"
          }}>
            <ShieldPlus size={24} className="pulse-live-dot" />
          </div>

          <div className="grow">
            <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", display: "flex", alignItems: "center", gap: 8 }}>
              ANTIDOTE+
              <span style={{
                background: "rgba(192, 57, 43, 0.9)",
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: "1px",
                textTransform: "uppercase",
                boxShadow: "0 0 10px rgba(192,57,43,0.5)"
              }}>Control Center</span>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600, marginTop: 1, display: "flex", alignItems: "center", gap: 6 }}>
              {isAdmin ? "National Response Dashboard" : "Clinical Dispatch Terminal"}
              <span className={`connection-indicator ${connectionStatus}`} style={{ padding: "1px 6px", fontSize: 9, borderRadius: 10, display: "inline-flex", alignItems: "center", gap: 3 }}>
                {connectionStatus === "ws" ? (
                  <><Wifi size={10} /> Live telemetry</>
                ) : (
                  <><WifiOff size={10} /> Polling mode</>
                )}
              </span>
            </div>
          </div>

          {/* Right Header Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* 📺 Judge Mode Presentation Switch */}
            <button
              onClick={() => {
                document.body.classList.toggle("judge-mode");
              }}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.1)",
                padding: "10px 16px",
                borderRadius: 12,
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                transition: "all 0.2s"
              }}
              className="presentation-btn-override demo-btn-override card-hover"
            >
              📺 Presentation Mode
            </button>

            {/* Notification Bell Icon */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowBellDropdown(!showBellDropdown)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  padding: 10,
                  borderRadius: 12,
                  color: "#fff",
                  position: "relative",
                  transition: "all 0.2s"
                }}
                className="card-hover"
              >
                <Bell size={20} />
                {unreadCount > 0 && <span className="nav-badge">{unreadCount}</span>}
              </button>

              {/* Notification Dropdown Menu */}
              {showBellDropdown && (
                <div className="glass-panel" style={{
                  position: "absolute",
                  right: 0,
                  top: 50,
                  width: 320,
                  borderRadius: 16,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                  background: "#fff",
                  color: "var(--dark)",
                  zIndex: 1000,
                  overflow: "hidden",
                  border: "1px solid var(--line)"
                }}>
                  <div style={{ padding: "12px 16px", background: "#f8f9fa", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 800, fontSize: 13 }}>Alert Feed</span>
                    {unreadCount > 0 && (
                      <button onClick={acknowledgeAll} style={{ fontSize: 11, color: "var(--teal)", fontWeight: 700 }}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: 280, overflowY: "auto" }}>
                    {notifications.length === 0 ? (
                      <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
                        No incidents registered
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          onClick={() => {
                            setShowBellDropdown(false);
                            acknowledgeNotification(n.id);
                            navigate("/cases");
                          }}
                          style={{
                            padding: "12px 16px",
                            borderBottom: "1px solid #f8f9fa",
                            cursor: "pointer",
                            background: n.acknowledged ? "transparent" : "var(--teal-pale)",
                            transition: "background 0.2s"
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                            <span style={{ fontWeight: 800, fontSize: 12 }}>ID: {n.id}</span>
                            <span style={{
                              fontSize: 9,
                              fontWeight: 900,
                              color: n.case.severity === "critical" || n.case.severity === "severe" ? "var(--danger)" : "var(--amber)"
                            }}>{n.case.severity.toUpperCase()}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>
                            Ambulance incoming from {n.case.village || "Kandlakoya"}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Logout control */}
            <button
              onClick={logout}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#fff",
                padding: "10px 16px",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 13,
              }}
              className="card-hover"
            >
              <LogOut size={16} /> <span className="desktop-nav">Exit Command</span>
            </button>
          </div>
        </div>

        {/* Desktop Tabs */}
        <div className="desktop-nav" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px", gap: 6 }}>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 20px",
                fontWeight: 700,
                fontSize: 14,
                color: isActive ? "#fff" : "rgba(255,255,255,0.65)",
                borderBottom: isActive ? "3px solid var(--teal-light)" : "3px solid transparent",
                textDecoration: "none",
                transition: "all 0.25s"
              })}
            >
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ maxWidth: 1200, width: "100%", margin: "0 auto", padding: "24px 20px 60px" }} className="fade main-content">
        {children}
      </main>

      {/* Floating Alerts popup overlay */}
      <NotificationPanel
        notifications={notifications}
        onAcknowledge={acknowledgeNotification}
        onNavigate={(c) => navigate("/cases")}
      />

      {/* Mobile Navigation Bar */}
      <nav className="mobile-nav">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "8px 12px",
              fontWeight: 700,
              fontSize: 11,
              color: isActive ? "var(--teal)" : "var(--muted)",
              textDecoration: "none",
              flex: 1,
              textAlign: "center"
            })}
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function Protected({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <RealtimeProvider>
      <Shell>{children}</Shell>
    </RealtimeProvider>
  );
}

export default function App() {
  const { user, ready } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={ready && user ? <Navigate to="/stock" replace /> : <Login />} />
      <Route path="/stock" element={<Protected><Stock /></Protected>} />
      <Route path="/cases" element={<Protected><Cases /></Protected>} />
      <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
      <Route path="*" element={<Navigate to="/stock" replace />} />
    </Routes>
  );
}
