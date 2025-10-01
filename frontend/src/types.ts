export type JobResult = {
  job_id?: string;
  times: number[];
  // trajectories[trajectoryIndex][timeIndex][dim]
  trajectories: number[][][];
  meta?: Record<string, any>;
};

export type TrajectoryStyle = {
  color: string;
  lineStyle: 'solid' | 'dashed' | 'dashdot' | 'dotted';
  width: number;
};

export type TrajectoryStyles = Record<string, TrajectoryStyle>; // key is trajectory index as string