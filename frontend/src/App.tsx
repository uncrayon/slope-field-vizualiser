import React, { useEffect, useState } from "react";
import axios from "axios";
import MonacoEditor from "./components/MonacoEditor";
import PlotlyChart from "./components/PlotlyChart";
import ThreeScene from "./components/ThreeScene";
import useWebSocket from "./hooks/useWebSocket";
import "./styles.css";

type ResultData = any;

export default function App() {
  const [equation, setEquation] = useState<string>(
    "{x'[t], y'[t]} == {x[t] - y[t], x[t]*y[t]}"
  );
  const [name, setName] = useState<string>("");
  const [t0, setT0] = useState<number>(0);
  const [tf, setTf] = useState<number>(10);
  const [icsText, setIcsText] = useState<string>("1,0\n0.5,0.5");
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [results, setResults] = useState<ResultData | null>(null);
  const [viewMode, setViewMode] = useState<"2D" | "3D">("2D");

  // WebSocket hook will connect and forward messages for the current jobId
  useWebSocket(jobId, (msg) => {
    // expected message shape: { type: 'status' | 'results', payload: ... }
    try {
      const parsed = typeof msg === "string" ? JSON.parse(msg) : msg;
      if (parsed.type === "status") {
        setStatus(parsed.payload);
      } else if (parsed.type === "results") {
        setStatus("finished");
        setResults(parsed.payload);
      }
    } catch {
      // fallback: if msg contains raw status
      setStatus(String(msg));
    }
  });

  useEffect(() => {
    // when jobId changes clear previous results
    if (jobId) {
      setResults(null);
      setStatus("queued");
    }
  }, [jobId]);

  const submit = async () => {
    try {
      const icLines = icsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => l.split(",").map((x) => parseFloat(x)));

      const payload = {
        equations: equation,
        name: name,
        timespan: [Number(t0), Number(tf)],
        initial_conditions: icLines,
        integrator: { method: "RK45" },
      };

      const resp = await axios.post("/submit", payload);
      setJobId(resp.data.job_id);
      setStatus("queued");
    } catch (e: any) {
      alert("Submit failed: " + (e?.response?.data || e.message));
    }
  };

  const pollStatus = async () => {
    if (!jobId) return;
    try {
      const resp = await axios.get(`/status/${jobId}`);
      setStatus(resp.data.status);
      if (resp.data.status === "finished") {
        const resultsResp = await axios.get(`/results/${jobId}`);
        setResults(resultsResp.data);
      }
    } catch (e: any) {
      alert("Status check failed: " + (e?.response?.data || e.message));
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Equation Phase Portrait Tool</h1>
      </header>

      <main className="app-main">
        <aside className="editor-panel">
          <label>Equations (Mathematica-like)</label>
          <MonacoEditor
            value={equation}
            language="plaintext"
            onChange={(v) => setEquation(v)}
          />
          <label>Name (optional)</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter a name for the plot"
          />
        </aside>

        <section className="controls">
          <div className="timespan">
            <label>t0</label>
            <input
              type="number"
              value={t0}
              onChange={(e) => setT0(Number(e.target.value))}
            />
            <label>tf</label>
            <input
              type="number"
              value={tf}
              onChange={(e) => setTf(Number(e.target.value))}
            />
          </div>

          <div>
            <label>Initial conditions (CSV lines)</label>
            <textarea
              className="ics"
              value={icsText}
              onChange={(e) => setIcsText(e.target.value)}
            />
          </div>

          <div className="actions">
            <button onClick={submit}>Submit</button>
            <button onClick={pollStatus} disabled={!jobId}>
              Check Status
            </button>
            <button
              onClick={() => {
                setViewMode((m) => (m === "2D" ? "3D" : "2D"));
              }}
              title="Toggle 2D / 3D view"
            >
              Toggle {viewMode}
            </button>
          </div>

          <div className="status">
            <strong>Job:</strong> {jobId ?? "—"} <strong>Status:</strong>{" "}
            {status ?? "—"}
          </div>
        </section>

        <section className="visualization">
          {!results && <div className="placeholder">No results yet</div>}

          {results && viewMode === "2D" && (
            <PlotlyChart data={results} />
          )}

          {results && viewMode === "3D" && (
            <ThreeScene data={results} />
          )}
        </section>
      </main>

      <footer className="app-footer">Built for interactive ODE exploration</footer>
    </div>
  );
}