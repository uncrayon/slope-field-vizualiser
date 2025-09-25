import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite config with a dev proxy to the FastAPI backend.
 * - Proxies REST endpoints (/submit, /status, /results) to http://localhost:8000
 * - Proxies websocket path (/ws) to ws://localhost:8000
 *
 * If your backend runs on a different port, update the target values below.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    // dev port for the frontend (optional)
    port: 5173,
    proxy: {
      // REST endpoints
      "/submit": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/status": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/results": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/slope_field": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      // WebSocket endpoint (backend exposes /ws/{job_id})
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});