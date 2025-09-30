export type JobResult = {
  job_id?: string;
  times: number[];
  // trajectories[trajectoryIndex][timeIndex][dim]
  trajectories: number[][][];
  meta?: Record<string, any>;
};

/**
 * Supported line styles for trajectory rendering
 */
export type LineStyle = 'solid' | 'dash' | 'dot' | 'dashdot' | 'longdash' | 'longdashdot';

/**
 * Style configuration for a trajectory
 */
export interface TrajectoryStyle {
  color: string;
  width: number;
  dash: LineStyle;
}

/**
 * Default trajectory style values
 */
export const DEFAULT_TRAJECTORY_STYLE: TrajectoryStyle = {
  color: '#3B82F6',
  width: 2,
  dash: 'solid',
};

/**
 * Predefined color palette for trajectories
 */
export const TRAJECTORY_COLOR_PALETTE: string[] = [
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#10B981', // Green
  '#F59E0B', // Amber
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#14B8A6', // Teal
  '#F97316', // Orange
];

/**
 * Unique identifier for a trajectory
 */
export type TrajectoryId = string;

/**
 * Map of trajectory IDs to their style configurations
 */
export type TrajectoryStyleMap = Map<TrajectoryId, TrajectoryStyle>;