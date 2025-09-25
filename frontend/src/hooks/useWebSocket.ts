import { useEffect, useRef } from "react";

/**
 * Simple WebSocket hook that connects to backend `/ws/{job_id}` endpoint.
 * - Connects when jobId is a non-null string.
 * - Closes when jobId becomes null or component unmounts.
 * - Calls onMessage for each incoming message (JSON parsed if possible).
 *
 * Usage:
 *   useWebSocket(jobId, (msg) => { ... });
 */
export default function useWebSocket(
  jobId: string | null,
  onMessage: (msg: any) => void
) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // close existing connection if any
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    if (!jobId) return;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.host;
    const url = `${protocol}://${host}/ws/${encodeURIComponent(jobId)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      // notify connected state if backend sends a message; otherwise we can send an optional hello
      // console.debug("WS connected", url);
    };

    ws.onmessage = (ev) => {
      let data: any = ev.data;
      try {
        data = JSON.parse(ev.data);
      } catch {
        // leave raw
      }
      onMessage(data);
    };

    ws.onerror = (e) => {
      // console.warn("WS error", e);
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, onMessage]);
}