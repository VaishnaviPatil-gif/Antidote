"""WebSocket real-time hub — the nervous system of Antidote+.

Manages persistent connections between hospital dashboards and victim apps so
emergency updates are delivered in under 1 second.  Two endpoint families:

  WS /ws/hospital/{hospital_id}  — dashboard connects here; receives push
                                    notifications for new/updated cases.
  WS /ws/victim/{case_id}        — victim app connects here; receives hospital
                                    preparation updates and messages.

The ConnectionManager tracks active connections per hospital and per case.
Messages are JSON objects with a `type` discriminator:

    { "type": "new_case",           "data": { ...case } }
    { "type": "case_update",        "data": { ...case } }
    { "type": "hospital_message",   "data": { "case_id", "message", "ts" } }
    { "type": "preparation_update", "data": { "case_id", "field", "value", "ts" } }
    { "type": "location_update",    "data": { "case_id", "lat", "lng", "ts" } }
    { "type": "ping" }  /  { "type": "pong" }
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Dict, List, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("antidote.realtime")
router = APIRouter()


# ── Connection Manager ──────────────────────────────────────────────────────
class ConnectionManager:
    """Thread-safe tracker for active WebSocket connections."""

    def __init__(self) -> None:
        # hospital_id → set of active WebSocket connections
        self._hospital_conns: Dict[str, Set[WebSocket]] = {}
        # case_id → set of active WebSocket connections (victim side)
        self._victim_conns: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    # ── Hospital connections ──

    async def connect_hospital(self, hospital_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            if hospital_id not in self._hospital_conns:
                self._hospital_conns[hospital_id] = set()
            self._hospital_conns[hospital_id].add(ws)
        logger.info("hospital WS connected: %s (total=%d)", hospital_id,
                     len(self._hospital_conns.get(hospital_id, set())))

    async def disconnect_hospital(self, hospital_id: str, ws: WebSocket) -> None:
        async with self._lock:
            conns = self._hospital_conns.get(hospital_id)
            if conns:
                conns.discard(ws)
                if not conns:
                    del self._hospital_conns[hospital_id]
        logger.info("hospital WS disconnected: %s", hospital_id)

    async def broadcast_to_hospital(self, hospital_id: str, message: dict) -> None:
        """Send a JSON message to ALL connected dashboards for a hospital."""
        async with self._lock:
            conns = list(self._hospital_conns.get(hospital_id, set()))
        dead: List[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        # Prune dead connections
        if dead:
            async with self._lock:
                s = self._hospital_conns.get(hospital_id)
                if s:
                    for d in dead:
                        s.discard(d)

    async def broadcast_to_all_hospitals(self, message: dict) -> None:
        """Send to every connected hospital (used for admin broadcasts)."""
        async with self._lock:
            all_ids = list(self._hospital_conns.keys())
        for hid in all_ids:
            await self.broadcast_to_hospital(hid, message)

    # ── Victim connections ──

    async def connect_victim(self, case_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            if case_id not in self._victim_conns:
                self._victim_conns[case_id] = set()
            self._victim_conns[case_id].add(ws)
        logger.info("victim WS connected: case %s", case_id)

    async def disconnect_victim(self, case_id: str, ws: WebSocket) -> None:
        async with self._lock:
            conns = self._victim_conns.get(case_id)
            if conns:
                conns.discard(ws)
                if not conns:
                    del self._victim_conns[case_id]
        logger.info("victim WS disconnected: case %s", case_id)

    async def broadcast_to_victim(self, case_id: str, message: dict) -> None:
        """Send a JSON message to victim app(s) for a specific case."""
        async with self._lock:
            conns = list(self._victim_conns.get(case_id, set()))
        dead: List[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                s = self._victim_conns.get(case_id)
                if s:
                    for d in dead:
                        s.discard(d)

    @property
    def stats(self) -> dict:
        return {
            "hospital_connections": {k: len(v) for k, v in self._hospital_conns.items()},
            "victim_connections": {k: len(v) for k, v in self._victim_conns.items()},
        }


# Singleton — imported by other route modules to broadcast events.
manager = ConnectionManager()


# ── WebSocket Endpoints ─────────────────────────────────────────────────────

@router.websocket("/ws/hospital/{hospital_id}")
async def hospital_websocket(ws: WebSocket, hospital_id: str):
    """Persistent connection for a hospital dashboard.

    The dashboard sends:
      • { "type": "ping" }  — keepalive (reply: pong)

    The server pushes:
      • new_case / case_update / preparation_update events
    """
    await manager.connect_hospital(hospital_id, ws)
    try:
        while True:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=60)
                msg = json.loads(raw)
                if msg.get("type") == "ping":
                    await ws.send_json({"type": "pong", "ts": time.time()})
            except asyncio.TimeoutError:
                # No message in 60s — send a server-side ping to keep alive
                try:
                    await ws.send_json({"type": "ping", "ts": time.time()})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("hospital WS error (%s): %s", hospital_id, exc)
    finally:
        await manager.disconnect_hospital(hospital_id, ws)


@router.websocket("/ws/victim/{case_id}")
async def victim_websocket(ws: WebSocket, case_id: str):
    """Persistent connection for a victim app after case submission.

    The victim sends:
      • { "type": "ping" }
      • { "type": "location_update", "data": { "lat": ..., "lng": ... } }

    The server pushes:
      • preparation_update / hospital_message events
    """
    from ..services import cases as store  # local import to avoid circular

    await manager.connect_victim(case_id, ws)
    try:
        while True:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=60)
                msg = json.loads(raw)
                msg_type = msg.get("type")

                if msg_type == "ping":
                    await ws.send_json({"type": "pong", "ts": time.time()})

                elif msg_type == "location_update":
                    data = msg.get("data", {})
                    lat = data.get("lat")
                    lng = data.get("lng")
                    if lat is not None and lng is not None:
                        ts = time.time()
                        store.update_case_location(case_id, lat, lng, ts)
                        # Forward to the hospital
                        case = store.get_case(case_id)
                        if case:
                            hid = case.get("assigned_hospital_id")
                            if hid:
                                await manager.broadcast_to_hospital(hid, {
                                    "type": "location_update",
                                    "data": {
                                        "case_id": case_id,
                                        "lat": lat,
                                        "lng": lng,
                                        "ts": ts,
                                    },
                                })

            except asyncio.TimeoutError:
                try:
                    await ws.send_json({"type": "ping", "ts": time.time()})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("victim WS error (%s): %s", case_id, exc)
    finally:
        await manager.disconnect_victim(case_id, ws)


@router.get("/ws/status", tags=["realtime"])
def ws_status() -> dict:
    """Diagnostic: show active WebSocket connections (no auth — debug only)."""
    return {"status": "ok", **manager.stats}
