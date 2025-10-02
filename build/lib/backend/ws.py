import asyncio
from typing import Dict, Set, Any
from fastapi import WebSocket

# Simple in-memory WebSocket broker.
# - register(job_id, websocket) keeps track of clients interested in a job
# - unregister(job_id, websocket) removes client
# - broadcast(job_id, message) sends JSON-serializable message to all registered clients
#
# Note: This is an in-process, best-effort broker suitable for a single-worker prototype.
# In production use a message broker (Redis pub/sub, NATS, Kafka) to scale across processes/nodes.

_job_clients: Dict[str, Set[WebSocket]] = {}
_lock = asyncio.Lock()


async def register(job_id: str, websocket: WebSocket) -> None:
    async with _lock:
        clients = _job_clients.get(job_id)
        if clients is None:
            clients = set()
            _job_clients[job_id] = clients
        clients.add(websocket)


async def unregister(job_id: str, websocket: WebSocket) -> None:
    async with _lock:
        clients = _job_clients.get(job_id)
        if not clients:
            return
        clients.discard(websocket)
        if not clients:
            # remove empty set
            _job_clients.pop(job_id, None)


async def broadcast(job_id: str, message: Any) -> None:
    """
    Send message to all connected clients for job_id.
    If a send fails, remove that client.
    """
    async with _lock:
        clients = list(_job_clients.get(job_id, set()))

    if not clients:
        return

    stale = []
    for ws in clients:
        try:
            await ws.send_json(message)
        except Exception:
            # mark stale
            stale.append(ws)

    if stale:
        async with _lock:
            s = _job_clients.get(job_id)
            if s:
                for ws in stale:
                    s.discard(ws)
                if not s:
                    _job_clients.pop(job_id, None)