import React, { useState, useCallback } from "react";
import { Send, MessageSquare, Loader2, CheckCircle2 } from "lucide-react";
import * as api from "../api.js";

/**
 * MessageComposer — quick-message panel for hospital → victim communication.
 *
 * Predefined messages plus a custom input. Each message is broadcast to the
 * victim app via the backend WebSocket channel.
 */

const QUICK_MESSAGES = [
  { text: "Emergency team ready.", icon: "🏥" },
  { text: "Neurologist waiting.", icon: "🧠" },
  { text: "ASV prepared.", icon: "💉" },
  { text: "Proceed to Emergency Gate.", icon: "🚪" },
  { text: "Ambulance dispatched.", icon: "🚑" },
  { text: "Please stay calm. Help is on the way.", icon: "🤝" },
];

export default function MessageComposer({ caseId, sentMessages = [] }) {
  const [custom, setCustom] = useState("");
  const [sending, setSending] = useState(null);
  const [sent, setSent] = useState(new Set());
  const [localMessages, setLocalMessages] = useState([]);

  const sendMsg = useCallback(async (text) => {
    setSending(text);
    try {
      await api.sendMessage(caseId, text);
      setSent((prev) => new Set([...prev, text]));
      setLocalMessages((prev) => [...prev, { text, ts: Date.now() }]);
      if (text === custom) setCustom("");
    } catch (e) {
      console.error("Failed to send message:", e);
    } finally {
      setSending(null);
    }
  }, [caseId, custom]);

  const allMessages = [...sentMessages, ...localMessages];

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        borderBottom: "1px solid var(--line)",
      }}>
        <MessageSquare size={16} style={{ color: "var(--teal)" }} />
        <span style={{ fontWeight: 800, fontSize: 14, color: "var(--dark)" }}>
          Send Update to Patient
        </span>
      </div>

      {/* Quick messages */}
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Quick Messages
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {QUICK_MESSAGES.map(({ text, icon }) => {
            const isSent = sent.has(text);
            const isLoading = sending === text;
            return (
              <button
                key={text}
                onClick={() => !isSent && sendMsg(text)}
                disabled={isSent || isLoading}
                className="card-hover"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 20,
                  border: isSent ? "1.5px solid var(--good)" : "1.5px solid var(--line)",
                  background: isSent ? "var(--good-pale)" : "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  color: isSent ? "var(--good)" : "var(--dark)",
                  transition: "all 0.2s",
                }}
              >
                {isLoading ? (
                  <Loader2 size={13} className="spin" />
                ) : isSent ? (
                  <CheckCircle2 size={13} />
                ) : (
                  <span>{icon}</span>
                )}
                {text}
              </button>
            );
          })}
        </div>

        {/* Custom message */}
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="Type a custom message…"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && custom.trim()) sendMsg(custom.trim()); }}
            className="premium-input"
            style={{ flex: 1, height: 42, fontSize: 13, borderRadius: 14 }}
          />
          <button
            onClick={() => custom.trim() && sendMsg(custom.trim())}
            disabled={!custom.trim() || sending}
            style={{
              display: "grid",
              placeItems: "center",
              width: 42,
              height: 42,
              borderRadius: 14,
              background: custom.trim() ? "var(--teal)" : "var(--line)",
              color: custom.trim() ? "#fff" : "var(--muted)",
              border: "none",
              transition: "all 0.2s",
            }}
          >
            {sending === custom.trim() ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
          </button>
        </div>

        {/* Sent messages log */}
        {allMessages.length > 0 && (
          <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>
              Sent Messages
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 120, overflowY: "auto" }}>
              {allMessages.slice(-5).map((m, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 12, color: "var(--dark)", fontWeight: 500,
                }}>
                  <CheckCircle2 size={12} style={{ color: "var(--good)", flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{m.text}</span>
                  <span style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0 }}>
                    {new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
