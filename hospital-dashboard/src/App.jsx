import React from "react";
import { Routes, Route, Navigate, NavLink } from "react-router-dom";
import { Boxes, Activity, BarChart3, LogOut, Loader2, ShieldPlus } from "lucide-react";
import { useAuth } from "./auth.jsx";
import { C } from "./theme.js";
import Login from "./pages/Login.jsx";
import Stock from "./pages/Stock.jsx";
import Cases from "./pages/Cases.jsx";
import Analytics from "./pages/Analytics.jsx";

const NAV = [
  { to: "/stock", label: "Antivenom Stock", icon: Boxes },
  { to: "/cases", label: "Incoming Cases", icon: Activity },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

function Loading() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: C.tealLight }}>
      <Loader2 size={34} className="spin" />
    </div>
  );
}

function Shell({ children }) {
  const { user, logout, isAdmin } = useAuth();
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* Top Header */}
      <header style={{
        background: `linear-gradient(135deg, var(--teal-dark) 0%, var(--teal) 100%)`,
        color: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 90,
      }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.2)",
            width: 42,
            height: 42,
            borderRadius: 14,
            display: "grid",
            placeItems: "center",
            color: "#fff"
          }}>
            <ShieldPlus size={22} />
          </div>
          <div className="grow">
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.3px", display: "flex", alignItems: "center", gap: 6 }}>
              Antidote+ 
              <span style={{ 
                background: "rgba(255,255,255,0.15)",
                padding: "2px 8px", 
                borderRadius: 20, 
                fontSize: 10, 
                fontWeight: 700, 
                letterSpacing: "0.5px", 
                textTransform: "uppercase" 
              }}>Console</span>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", fontWeight: 500, marginTop: 1 }} className="truncate">
              {user?.name} {isAdmin ? "· District Health Office" : "· Staff Account"}
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#fff",
              padding: "8px 14px",
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <LogOut size={14} /> <span className="desktop-nav">Log out</span>
          </button>
        </div>

        {/* Desktop Tabs */}
        <div className="desktop-nav" style={{ maxWidth: 1120, margin: "0 auto", padding: "0 20px", gap: 6 }}>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 18px",
                fontWeight: 600,
                fontSize: 14,
                color: isActive ? "#fff" : "rgba(255,255,255,0.7)",
                borderBottom: isActive ? "3px solid #fff" : "3px solid transparent",
                textDecoration: "none",
              })}
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: 1120, width: "100%", margin: "0 auto", padding: "24px 20px 60px" }} className="fade main-content">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
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
              padding: "6px 12px",
              fontWeight: 600,
              fontSize: 11,
              color: isActive ? "var(--teal)" : "var(--muted)",
              textDecoration: "none",
              flex: 1,
              textAlign: "center"
            })}
          >
            <Icon size={20} />
            <span>{label.replace("Antivenom ", "")}</span>
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
  return <Shell>{children}</Shell>;
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
