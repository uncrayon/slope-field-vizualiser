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
      }
    };
    fetchSlopeField();
  }, [equation, xMin, xMax, yMin, yMax, zMin, zMax, viewMode, gridSize]);

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
      setErrorMessage(null);
      setWarnings([]);
    } catch (e: any) {
      alert("Submit failed: " + (e?.response?.data || e.message));
    }
  };

  const pollStatus = async () => {
    if (!jobId) return;
    try {
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
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <div>
            <h1>Slope Field Studio</h1>
            <p>Elegantly explore dynamical systems</p>
          </div>
        </div>

        <div className="header-status" role="status">
          <span className="status-label">Status</span>
          <span className={`status-pill ${status ?? "idle"}`}>
            {status ?? "idle"}
          </span>
          <span className="status-job">Job {jobId ?? "—"}</span>
        </div>
      </header>

      <main className="app-main">
        <div className="side-panel">
          <section className="panel editor-panel">
            <div className="panel-header">
              <h2>Equation</h2>
              <p>Describe your system using Mathematica-like syntax.</p>
            </div>
            <label className="field-label" htmlFor="equation-editor">
              Differential relations
            </label>
            <MonacoEditor
              value={equation}
              language="plaintext"
              onChange={(v) => setEquation(v)}
              options={{ fontSize: 14 }}
              id="equation-editor"
            />
            <label className="field-label" htmlFor="plot-name">
              Presentation name
            </label>
            <input
              id="plot-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Phase portrait name"
            />
          </section>

          <section className="panel control-panel">
            <div className="panel-header">
              <h2>Parameters</h2>
              <p>Tune the time span, initial conditions, and rendering options.</p>
            </div>

            <div className="field-grid timespan">
              <label className="field-label" htmlFor="t0">
                Start (t₀)
              </label>
              <input
                id="t0"
                type="number"
                value={t0}
                onChange={(e) => setT0(Number(e.target.value))}
              />
              <label className="field-label" htmlFor="tf">
                End (t_f)
              </label>
              <input
                id="tf"
                type="number"
                value={tf}
                onChange={(e) => setTf(Number(e.target.value))}
              />
            </div>

            <div className="stack">
              <label className="field-label" htmlFor="ics">
                Initial conditions (CSV)
              </label>
              <textarea
                id="ics"
                className="ics"
                value={icsText}
                onChange={(e) => setIcsText(e.target.value)}
              />
            </div>

            <div className="ranges">
              <div className="range-header">
                <h3>Domain</h3>
                <button
                  type="button"
                  className="view-toggle"
                  onClick={() => {
                    setViewMode((m) => (m === "2D" ? "3D" : "2D"));
                  }}
                  title="Toggle 2D / 3D view"
                >
                  {viewMode === "2D" ? "Switch to 3D" : "Switch to 2D"}
                </button>
              </div>
              <div className="field-grid">
                <label className="field-label" htmlFor="x-min">
                  x min
                </label>
                <input
                  id="x-min"
                  type="number"
                  value={xMin}
                  onChange={(e) => setXMin(Number(e.target.value))}
                />
                <label className="field-label" htmlFor="x-max">
                  x max
                </label>
                <input
                  id="x-max"
                  type="number"
                  value={xMax}
                  onChange={(e) => setXMax(Number(e.target.value))}
                />
              </div>
              <div className="field-grid">
                <label className="field-label" htmlFor="y-min">
                  y min
                </label>
                <input
                  id="y-min"
                  type="number"
                  value={yMin}
                  onChange={(e) => setYMin(Number(e.target.value))}
                />
                <label className="field-label" htmlFor="y-max">
                  y max
                </label>
                <input
                  id="y-max"
                  type="number"
                  value={yMax}
                  onChange={(e) => setYMax(Number(e.target.value))}
                />
              </div>
              {viewMode === "3D" && (
                <div className="field-grid">
                  <label className="field-label" htmlFor="z-min">
                    z min
                  </label>
                  <input
                    id="z-min"
                    type="number"
                    value={zMin}
                    onChange={(e) => setZMin(Number(e.target.value))}
                  />
                  <label className="field-label" htmlFor="z-max">
                    z max
                  </label>
                  <input
                    id="z-max"
                    type="number"
                    value={zMax}
                    onChange={(e) => setZMax(Number(e.target.value))}
                  />
                </div>
              )}
              <div className="field-grid">
                <label className="field-label" htmlFor="grid">
                  Grid density
                </label>
                <input
                  id="grid"
                  type="number"
                  value={gridSize}
                  onChange={(e) => setGridSize(Number(e.target.value))}
                  min="10"
                  max="50"
                />
                <label className="field-label" htmlFor="arrow-length">
                  Arrow length
                </label>
                <input
                  id="arrow-length"
                  type="number"
                  value={arrowLength}
                  onChange={(e) => setArrowLength(Number(e.target.value))}
                  min="0.05"
                  max="0.5"
                  step="0.01"
                />
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={showSlopeField}
                  onChange={(e) => setShowSlopeField(e.target.checked)}
                />
                <span>Show slope field overlay</span>
              </label>
            </div>

            <div className="actions">
              <button className="primary" onClick={submit}>
                Render portrait
              </button>
              <button className="secondary" onClick={pollStatus} disabled={!jobId}>
                Check status
              </button>
            </div>

            {(errorMessage || warnings.length > 0) && (
              <div className="feedback">
                {errorMessage && <p className="error">{errorMessage}</p>}
                {warnings.length > 0 && (
                  <ul className="warning-list">
                    {warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>

        <section className="panel visualization">
          <div className="panel-header">
            <h2>{viewMode === "2D" ? "Phase portrait" : "3D trajectory"}</h2>
            <p>
              {viewMode === "2D"
                ? "Interact with the slope field and simulated trajectories."
                : "Explore the 3D motion with pinch and drag gestures."}
            </p>
          </div>

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
            <div className="placeholder">No results yet</div>
          )}
        </section>
      </main>

      <footer className="app-footer">
        <span>Built for interactive ODE exploration</span>
        <span className="footer-meta">Crafted with precision mathematics</span>
      </footer>
    </div>
  );
}