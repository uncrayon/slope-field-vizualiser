import { JobResult } from '../types';

/**
 * Generates a stable trajectory ID from initial conditions.
 * 
 * @param initialCondition - Array of initial condition values
 * @returns Trajectory ID in format "ic_x1_x2_x3_..." where values are rounded to 6 decimals
 * @example
 * generateTrajectoryId([1.0, 2.0, 3.0]) // returns "ic_1_2_3"
 * generateTrajectoryId([1.123456789, 2.5]) // returns "ic_1.123457_2.5"
 */
export function generateTrajectoryId(initialCondition: number[]): string {
  if (!initialCondition || initialCondition.length === 0) {
    return 'ic_empty';
  }
  
  const rounded = initialCondition.map(val => {
    const rounded = Math.round(val * 1e6) / 1e6;
    return rounded.toString();
  });
  
  return `ic_${rounded.join('_')}`;
}

/**
 * Extracts trajectory IDs from a job result.
 * 
 * Uses initial_conditions from metadata if available, otherwise falls back to
 * index-based IDs (traj_0, traj_1, etc.).
 * 
 * @param result - Job result containing trajectories
 * @returns Array of trajectory IDs corresponding to each trajectory
 * @example
 * // With metadata:
 * extractTrajectoryIds(result) // returns ["ic_1_2", "ic_3_4"]
 * // Without metadata:
 * extractTrajectoryIds(result) // returns ["traj_0", "traj_1"]
 */
export function extractTrajectoryIds(result: JobResult): string[] {
  if (!result.trajectories || result.trajectories.length === 0) {
    return [];
  }
  
  // Check if initial_conditions exists in metadata
  if (result.meta?.initial_conditions && Array.isArray(result.meta.initial_conditions)) {
    return result.meta.initial_conditions.map((ic: number[]) => generateTrajectoryId(ic));
  }
  
  // Fallback to index-based IDs
  return result.trajectories.map((_, index) => `traj_${index}`);
}

/**
 * Gets a human-readable display name for a trajectory.
 * 
 * @param id - Trajectory ID
 * @param initialCondition - Optional initial condition values for formatting
 * @returns Formatted display name, e.g., "(1.00, 2.00, 3.00)"
 * @example
 * getTrajectoryDisplayName("ic_1_2_3", [1, 2, 3]) // returns "(1.00, 2.00, 3.00)"
 * getTrajectoryDisplayName("ic_1_2_3") // returns "(1, 2, 3)"
 * getTrajectoryDisplayName("traj_0") // returns "Trajectory 0"
 */
export function getTrajectoryDisplayName(id: string, initialCondition?: number[]): string {
  // If initial condition is provided, format it directly
  if (initialCondition && initialCondition.length > 0) {
    const formatted = initialCondition.map(val => val.toFixed(2)).join(', ');
    return `(${formatted})`;
  }
  
  // Parse ID to extract values
  if (id.startsWith('ic_')) {
    const parts = id.substring(3).split('_');
    const values = parts.map(p => {
      const num = parseFloat(p);
      return isNaN(num) ? p : num.toFixed(2);
    });
    return `(${values.join(', ')})`;
  }
  
  // Handle traj_N format
  if (id.startsWith('traj_')) {
    const index = id.substring(5);
    return `Trajectory ${index}`;
  }
  
  // Fallback for unknown formats
  return id;
}