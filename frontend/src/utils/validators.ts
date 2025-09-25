import { JobResult } from "../types";

/**
 * Lightweight runtime check to confirm an object looks like JobResult.
 * This is intentionally permissive: it checks primary shape only.
 */
export function isJobResult(obj: any): obj is JobResult {
  if (!obj || typeof obj !== "object") return false;
  if (!Array.isArray(obj.times)) return false;
  if (!Array.isArray(obj.trajectories)) return false;
  // quick shape check: each trajectory is array of points, each point is array of numbers
  for (const traj of obj.trajectories) {
    if (!Array.isArray(traj)) return false;
    for (const pt of traj) {
      if (!Array.isArray(pt)) return false;
      for (const v of pt) {
        if (typeof v !== "number") return false;
      }
    }
  }
  return true;
}