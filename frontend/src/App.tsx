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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"2D" | "3D">("2D");
  const [xMin, setXMin] = useState<number>(-10);
  const [xMax, setXMax] = useState<number>(10);
  const [yMin, setYMin] = useState<number>(-10);
  const [yMax, setYMax] = useState<number>(10);
  const [zMin, setZMin] = useState<number>(-10);
  const [zMax, setZMax] = useState<number>(10);
  const [showSlopeField, setShowSlopeField] = useState<boolean>(true);
  const [slopeFieldData, setSlopeFieldData] = useState<any>(null);
  const [gridSize, setGridSize] = useState<number>(30);
  const [arrowLength, setArrowLength] = useState<number>(0.15);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [isFetchingSlopeField, setIsFetchingSlopeField] = useState<boolean>(false);

  // WebSocket hook will connect and forward messages for the current jobId
  useWebSocket(jobId, (msg) => {
    // expected message shape: { type: 'status' | 'results', payload: ... }
    try {
      const parsed = typeof msg === "string" ? JSON.parse(msg) : msg;
      if (parsed.type === "status") {
        const payload = parsed.payload ?? {};
        if (typeof payload.status === "string") {
          setStatus(payload.status);
          if (payload.status === "failed") {
            setErrorMessage(payload.error ?? "Solver failed to complete the job.");
          } else {
            setErrorMessage(null);
          }
          if (Array.isArray(payload.warnings)) {
            setWarnings(payload.warnings.map((w: any) => String(w)));
          } else if (payload.warning) {
            setWarnings([String(payload.warning)]);
          } else {
            setWarnings([]);
          }
        } else {
          setStatus(String(payload));
        }
      } else if (parsed.type === "results") {
        setStatus("finished");
        setResults(parsed.payload);
        setErrorMessage(null);
        setWarnings([]);
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
      setErrorMessage(null);
      setWarnings([]);
    }
  }, [jobId]);

  useEffect(() => {
    const fetchSlopeField = async () => {
      if (!equation.trim()) return;
      try {
        setIsFetchingSlopeField(true);
        const payload = {
          equations: equation,
          x_min: xMin,
          x_max: xMax,
          y_min: yMin,
          y_max: yMax,
          grid_size: gridSize,
          ...(viewMode === "3D" ? { z_min: zMin, z_max: zMax } : {}),
        };
        const resp = await axios.post("/slope_field", payload);
        setSlopeFieldData(resp.data);
      } catch (e: any) {
        console.error("Slope field fetch failed:", e);
        setSlopeFieldData(null);
      } finally {
        setIsFetchingSlopeField(false);
      }
    };
    fetchSlopeField();
  }, [equation, xMin, xMax, yMin, yMax, zMin, zMax, viewMode, gridSize]);

  const submit = async () => {
    try {
      setIsSubmitting(true);
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
      setErrorMessage(null);
      setWarnings([]);
    } catch (e: any) {
      alert("Submit failed: " + (e?.response?.data || e.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  const pollStatus = async () => {
    if (!jobId) return;
    try {
      setIsPolling(true);
      const resp = await axios.get(`/status/${jobId}`);
      setStatus(resp.data.status);
      if (resp.data.error) {
        setErrorMessage(resp.data.error);
      } else {
        setErrorMessage(null);
      }
      if (Array.isArray(resp.data.warnings)) {
        setWarnings(resp.data.warnings.map((w: any) => String(w)));
      } else {
        setWarnings([]);
      }
      if (resp.data.status === "finished") {
        const resultsResp = await axios.get(`/results/${jobId}`);
        setResults(resultsResp.data);
        setErrorMessage(null);
        setWarnings(resultsResp.data?.warnings ?? []);
      }
    } catch (e: any) {
      alert("Status check failed: " + (e?.response?.data || e.message));
    } finally {
      setIsPolling(false);
    }
  };

  const statusTone = (() => {
    if (status === "finished") return "success";
    if (status === "failed") return "danger";
    if (status === "running") return "active";
    if (status === "queued") return "pending";
    return "idle";
  })();

  const statusLabel = status ? status.charAt(0).toUpperCase() + status.slice(1) : "Idle";

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">∂</div>
          <div className="brand-copy">
            <h1>PhaseCanvas</h1>
            <p>Interactive slope fields with a refined touch</p>
          </div>
        </div>
        <div className="header-status">
          <span className={`status-badge status-${statusTone}`}>
            {statusLabel}
          </span>
          <span className="job-meta">{jobId ? `Job ${jobId}` : "No job yet"}</span>
        </div>
      </header>

      <main className="app-main">
        <aside className="sidebar">
          <div className="panel panel-editor">
            <div className="panel-header">
              <h2>System Definition</h2>
              <p>Describe your differential equations in Mathematica-style syntax.</p>
            </div>
            <label className="field-label">Equations</label>
            <div className="editor-shell">
              <MonacoEditor
                value={equation}
                language="plaintext"
                onChange={(v) => setEquation(v)}
              />
            </div>
            <label className="field-label">Name (optional)</label>
            <input
              className="input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name your system"
            />
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Simulation Controls</h2>
              <p>Refine initial conditions, time span, and visual density.</p>
            </div>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Start (t₀)</label>
                <input
                  className="input"
                  type="number"
                  value={t0}
                  onChange={(e) => setT0(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label className="field-label">End (t_f)</label>
                <input
                  className="input"
                  type="number"
                  value={tf}
                  onChange={(e) => setTf(Number(e.target.value))}
                />
              </div>
            </div>

            <label className="field-label">Initial conditions</label>
            <textarea
              className="textarea"
              value={icsText}
              onChange={(e) => setIcsText(e.target.value)}
              placeholder="e.g. 1,0"
            />
            <p className="helper-text">Enter one coordinate pair per line.</p>

            <div className="range-grid">
              <div className="field">
                <label className="field-label">x min</label>
                <input
                  className="input"
                  type="number"
                  value={xMin}
                  onChange={(e) => setXMin(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label className="field-label">x max</label>
                <input
                  className="input"
                  type="number"
                  value={xMax}
                  onChange={(e) => setXMax(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label className="field-label">y min</label>
                <input
                  className="input"
                  type="number"
                  value={yMin}
                  onChange={(e) => setYMin(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label className="field-label">y max</label>
                <input
                  className="input"
                  type="number"
                  value={yMax}
                  onChange={(e) => setYMax(Number(e.target.value))}
                />
              </div>
              {viewMode === "3D" && (
                <>
                  <div className="field">
                    <label className="field-label">z min</label>
                    <input
                      className="input"
                      type="number"
                      value={zMin}
                      onChange={(e) => setZMin(Number(e.target.value))}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">z max</label>
                    <input
                      className="input"
                      type="number"
                      value={zMax}
                      onChange={(e) => setZMax(Number(e.target.value))}
                    />
                  </div>
                </>
              )}
              <div className="field">
                <label className="field-label">Grid density</label>
                <input
                  className="input"
                  type="number"
                  value={gridSize}
                  onChange={(e) => setGridSize(Number(e.target.value))}
                  min="10"
                  max="50"
                />
              </div>
              <div className="field">
                <label className="field-label">Arrow length</label>
                <input
                  className="input"
                  type="number"
                  value={arrowLength}
                  onChange={(e) => setArrowLength(Number(e.target.value))}
                  min="0.05"
                  max="0.5"
                  step="0.01"
                />
              </div>
            </div>

            <div className="actions">
              <button className="btn" onClick={submit} disabled={isSubmitting}>
                {isSubmitting ? "Submitting…" : "Run simulation"}
              </button>
              <button className="btn btn-secondary" onClick={pollStatus} disabled={!jobId || isPolling}>
                {isPolling ? "Checking…" : "Check status"}
              </button>
            </div>

            <div className="status-card">
              <div className="status-line">
                <span className="status-title">Job ID</span>
                <span>{jobId ?? "—"}</span>
              </div>
              <div className="status-line">
                <span className="status-title">Solver status</span>
                <span>{status ?? "—"}</span>
              </div>
              {errorMessage && <div className="status-error">{errorMessage}</div>}
              {warnings.length > 0 && (
                <ul className="status-warning">
                  {warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </aside>

        <section className="visualization">
          <div className="visual-header">
            <div>
              <h2>Visualizer</h2>
              <p>{viewMode === "2D" ? "Explore trajectories and vector flow." : "Rotate and inspect solution surfaces."}</p>
            </div>
            <div className="visual-controls">
              <div className="view-toggle" role="group" aria-label="View mode">
                <button
                  type="button"
                  className={viewMode === "2D" ? "active" : ""}
                  onClick={() => setViewMode("2D")}
                >
                  2D Field
                </button>
                <button
                  type="button"
                  className={viewMode === "3D" ? "active" : ""}
                  onClick={() => setViewMode("3D")}
                >
                  3D Trajectories
                </button>
              </div>
              <label className={`switch ${viewMode === "3D" ? "disabled" : ""}`}>
                <input
                  type="checkbox"
                  checked={showSlopeField}
                  onChange={(e) => setShowSlopeField(e.target.checked)}
                  disabled={viewMode === "3D"}
                />
                <span className="switch-slider" />
                <span className="switch-label">Slope field</span>
              </label>
            </div>
          </div>

          <div className="visual-stage">
            {viewMode === "2D" && (
              <PlotlyChart
                data={results || { trajectories: [], meta: {} }}
                slopeFieldData={slopeFieldData}
                showSlopeField={showSlopeField}
                xMin={xMin}
                xMax={xMax}
                yMin={yMin}
                yMax={yMax}
                arrowLength={arrowLength}
              />
            )}

            {viewMode === "3D" && results && <ThreeScene data={results} />}

            {!results && viewMode === "3D" && (
              <div className="placeholder">Run a simulation to unlock the 3D view.</div>
            )}
          </div>

          {isFetchingSlopeField && viewMode === "2D" && (
            <div className="slopefield-hint">Updating slope field…</div>
          )}
        </section>
      </main>

      <footer className="app-footer">Crafted for interactive ODE exploration</footer>
    </div>
  );
}