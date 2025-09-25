export type JobResult = {
  job_id?: string;
  times: number[];
  // trajectories[trajectoryIndex][timeIndex][dim]
  trajectories: number[][][];
  meta?: Record<string, any>;
};