import React, { useEffect, useRef } from "react";
import Plotly from "plotly.js-dist-min";
import { JobResult } from "../types";

type Props = {
  data: JobResult;
  xIndex?: number;
  yIndex?: number;
};

const PlotlyChart: React.FC<Props> = ({ data, xIndex = 0, yIndex = 1 }) => {
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

    const layout = {
      title: `Phase Portrait: ${data.meta?.name || data.meta?.equations || `x${xIndex} vs x${yIndex}`}`,
      xaxis: { title: `x${xIndex}` },
      yaxis: { title: `x${yIndex}` },
      autosize: true,
    };

    Plotly.react(ref.current, traces as any, layout as any, { responsive: true });

    return () => {
      try {
        Plotly.purge(ref.current!);
      } catch {}
    };
  }, [data, xIndex, yIndex]);

  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
};

export default PlotlyChart;