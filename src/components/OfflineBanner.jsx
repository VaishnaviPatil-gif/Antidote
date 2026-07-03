import React, { useState, useEffect } from "react";
import { WifiOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { C } from "../theme.js";
import { tFor } from "../i18n.js";
import { useOnline } from "../hooks/useOnline.js";
import { useEmergency } from "../context/EmergencyContext.jsx";
import { processSyncQueue, getSyncQueue } from "../lib/sync.js";

/**
 * Persistent sync-aware offline / sync progress banner.
 *
 * Automatically triggers queue synchronisation when connection is restored,
 * rendering sync progress, item counts, and completion confirmations.
 */
export default function OfflineBanner() {
  const online = useOnline();
  const context = useEmergency();
  const { language } = context;
  const t = tFor(language);

  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | completed
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, detail: "" });
  const [queueLength, setQueueLength] = useState(0);

  // Update queue length badge/indicator
  useEffect(() => {
    const updateLength = () => {
      setQueueLength(getSyncQueue().length);
    };
    updateLength();
    window.addEventListener("sync-queue-updated", updateLength);
    return () => window.removeEventListener("sync-queue-updated", updateLength);
  }, []);

  // Sync auto-trigger when regaining connection
  useEffect(() => {
    if (online) {
      const queue = getSyncQueue();
      if (queue.length > 0) {
        setSyncStatus("syncing");
        processSyncQueue(
          (current, total, detail) => {
            setSyncProgress({ current, total, detail });
            if (detail === "completed") {
              setSyncStatus("completed");
              setTimeout(() => {
                setSyncStatus("idle");
              }, 3000);
            }
          },
          context
        );
      }
    }
  }, [online, context]);

  if (online && syncStatus === "idle") return null;

  if (syncStatus === "syncing") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ background: C.tealPale, borderColor: C.teal + "33" }}
      >
        <span className="flex items-center gap-2 text-xs font-semibold leading-snug" style={{ color: C.teal }}>
          <RefreshCw size={14} className="ap-spin shrink-0" style={{ color: C.teal }} />
          <span>
            Syncing offline actions ({syncProgress.current}/{syncProgress.total})...
          </span>
        </span>
        <span className="text-[9px] font-extrabold uppercase tracking-wider truncate max-w-[120px]" style={{ color: C.muted }}>
          {syncProgress.detail}
        </span>
      </div>
    );
  }

  if (syncStatus === "completed") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 px-4 py-2 border-b"
        style={{ background: C.goodPale, borderColor: C.good + "33" }}
      >
        <CheckCircle2 size={15} style={{ color: C.good }} className="shrink-0" />
        <span className="text-xs font-semibold leading-snug" style={{ color: C.good }}>
          All offline data synchronized successfully!
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between px-4 py-2 border-b"
      style={{ background: C.amberPale, borderColor: C.amber + "33" }}
    >
      <span className="flex items-center gap-2 text-xs font-semibold leading-snug" style={{ color: C.amber }}>
        <WifiOff size={15} style={{ color: C.amber }} className="shrink-0" />
        <span>{t.offline.banner}</span>
      </span>
      {queueLength > 0 && (
        <span className="rounded-full px-2 py-0.5 text-[9px] font-black text-white uppercase tracking-wider" style={{ background: C.amber }}>
          {queueLength} pending
        </span>
      )}
    </div>
  );
}
