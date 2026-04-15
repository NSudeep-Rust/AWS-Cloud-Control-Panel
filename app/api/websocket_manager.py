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
        self._loop = None   # captured from the async context; used by background threads

    async def connect(self, ws: WebSocket):
        # Capture the running asyncio event loop the first time a client connects.
        # This is the ONLY reliable way to get the correct loop from a background thread.
        if self._loop is None:
            self._loop = asyncio.get_running_loop()
        await ws.accept()
        self._clients.add(ws)
        print(f"[WS] Client connected ({len(self._clients)} total)")

    def disconnect(self, ws: WebSocket):
        self._clients.discard(ws)
        print(f"[WS] Client disconnected ({len(self._clients)} remaining)")

    async def broadcast(self, payload: dict):
        """Push a JSON payload to every connected client."""
        # Also capture loop here so broadcast_sync works even before first connect
        if self._loop is None:
            try:
                self._loop = asyncio.get_running_loop()
            except RuntimeError:
                pass
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
        Thread-safe broadcast for use from non-async code (scheduler / monitor threads).

        IMPORTANT: asyncio.get_event_loop() called from a background thread on
        Python 3.10+ does NOT return the running FastAPI loop — it creates a new
        non-running loop, making is_running() False and dropping the message silently.
        We avoid this by storing the loop reference in the async context (connect /
        broadcast) and using it here.
        """
        loop = self._loop
        if loop is None or not loop.is_running():
            print("[WS][WARN] broadcast_sync: no running event loop — message dropped")
            return
        asyncio.run_coroutine_threadsafe(self.broadcast(payload), loop)


ws_manager = AlertWebSocketManager()
