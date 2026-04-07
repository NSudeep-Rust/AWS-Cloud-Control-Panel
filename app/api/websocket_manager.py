# websocket_manager.py
# Manages WebSocket clients for instant alert push (Windows Defender style)
from fastapi import WebSocket
from typing import Set
import json
import asyncio


class AlertWebSocketManager:
    """
    Singleton that holds all connected browser WebSocket clients.
    When the monitor detects a new alert, it calls broadcast() to
    push it to ALL connected clients instantly — zero polling delay.
    """

    def __init__(self):
        self._clients: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._clients.add(ws)
        print(f"🔌 WS client connected ({len(self._clients)} total)")

    def disconnect(self, ws: WebSocket):
        self._clients.discard(ws)
        print(f"🔌 WS client disconnected ({len(self._clients)} remaining)")

    async def broadcast(self, payload: dict):
        """Push a JSON payload to every connected client."""
        if not self._clients:
            return
        msg = json.dumps(payload)
        dead = set()
        for ws in list(self._clients):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._clients.discard(ws)

    def broadcast_sync(self, payload: dict):
        """
        Thread-safe broadcast for use from non-async code (MonitorService thread).
        Schedules the async broadcast on the event loop.
        """
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.run_coroutine_threadsafe(self.broadcast(payload), loop)
        except RuntimeError:
            pass  # No event loop — silent fallback


# Global singleton — imported by threat_routes and websocket route
ws_manager = AlertWebSocketManager()
