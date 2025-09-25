import React, { useEffect, useRef } from "react";
import Plotly from "plotly.js-dist-min";
import { JobResult } from "../types";

type Props = {
  data: JobResult;
  xIndex?: number;
  yIndex?: number;
  slopeFieldData?: any;
  showSlopeField?: boolean;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  arrowLength?: number;
};

const PlotlyChart: React.FC<Props> = ({ data, xIndex = 0, yIndex = 1, slopeFieldData, showSlopeField = true, xMin = -10, xMax = 10, yMin = -10, yMax = 10, arrowLength = 0.15 }) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const traces = (data.trajectories || []).map((traj, i) => {
      const x = traj.map((p) => (p.length > xIndex ? p[xIndex] : 0));
      const y = traj.map((p) => (p.length > yIndex ? p[yIndex] : 0));
      const condition = data.meta?.initial_conditions?.[i]?.join(', ') || `traj ${i}`;
      return {
        x,
        y,
        mode: "lines",
        name: condition,
      };
    });

    if (showSlopeField && slopeFieldData) {
      const lineX: any[] = [];
      const lineY: any[] = [];
      for (let i = 0; i < slopeFieldData.x.length; i++) {
        const x = slopeFieldData.x[i];
        const y = slopeFieldData.y[i];
        const u = slopeFieldData.u[i];
        const v = slopeFieldData.v[i];
        const mag = Math.sqrt(u * u + v * v);
        if (mag > 1e-6) { // avoid zero vectors
          // Normalize and scale
          const uNorm = (u / mag) * arrowLength;
          const vNorm = (v / mag) * arrowLength;
          // Draw arrow from start to end
          lineX.push(x, x + uNorm, null);
          lineY.push(y, y + vNorm, null);
        }
      }
      // Single trace with lines and arrowheads
      traces.push({
        x: lineX,
        y: lineY,
        mode: "lines+markers",
        line: { color: "gray", width: 1 },
        marker: {
          symbol: "arrow",
          size: 8,
          angleref: "previous",
          color: "gray",
        },
        name: "Slope Field",
        showlegend: false,
      } as any);
    }

    const layout = {
      title: `Phase Portrait: ${data.meta?.name || data.meta?.equations || `x${xIndex} vs x${yIndex}`}`,
      xaxis: { title: `x${xIndex}`, range: [xMin, xMax], autorange: false },
      yaxis: { title: `x${yIndex}`, range: [yMin, yMax], autorange: false },
      autosize: true,
    };

    Plotly.react(ref.current, traces as any, layout as any, { responsive: true });

    return () => {
      try {
        Plotly.purge(ref.current!);
      } catch {}
    };
  }, [data, xIndex, yIndex, slopeFieldData, showSlopeField, xMin, xMax, yMin, yMax, arrowLength]);

  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
};

export default PlotlyChart;