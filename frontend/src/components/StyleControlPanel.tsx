import React from 'react';
import {
  TrajectoryId,
  TrajectoryStyle,
  TrajectoryStyleMap,
  LineStyle,
} from '../types';
import { getTrajectoryDisplayName } from '../utils/trajectoryId';

interface Props {
  trajectories: number[][][];
  trajectoryIds: TrajectoryId[];
  initialConditions?: number[][];
  styles: TrajectoryStyleMap;
  selectedId: TrajectoryId | null;
  onSelectTrajectory: (id: TrajectoryId | null) => void;
  onUpdateStyle: (id: TrajectoryId, updates: Partial<TrajectoryStyle>) => void;
  onResetStyle: (id: TrajectoryId) => void;
  onResetAll: () => void;
}

/**
 * Converts LineStyle to SVG strokeDasharray values
 */
function getDashArray(dash?: LineStyle): string {
  switch (dash) {
    case 'dash':
      return '5,5';
    case 'dot':
      return '1,3';
    case 'dashdot':
      return '5,3,1,3';
    case 'longdash':
      return '10,5';
    case 'longdashdot':
      return '10,5,1,5';
    case 'solid':
    default:
      return '';
  }
}

export function StyleControlPanel({
  trajectories,
  trajectoryIds,
  initialConditions,
  styles,
  selectedId,
  onSelectTrajectory,
  onUpdateStyle,
  onResetStyle,
  onResetAll,
}: Props) {
  const selectedStyle = selectedId ? styles.get(selectedId) : null;

  return (
    <div className="style-control-panel">
      {/* Trajectory List Section */}
      <div className="trajectory-list-section">
        <h3>Trajectories</h3>
        <div className="trajectory-list">
          {trajectoryIds.map((id, index) => {
            const style = styles.get(id);
            const trajectory = trajectories[index];
            const initialCondition = initialConditions?.[index];
            const isSelected = id === selectedId;
            const pointCount = trajectory?.length || 0;
            const displayName = getTrajectoryDisplayName(id, initialCondition);

            return (
              <div
                key={id}
                className={`trajectory-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectTrajectory(isSelected ? null : id)}
                role="button"
                tabIndex={0}
                aria-label={`Select trajectory ${displayName}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectTrajectory(isSelected ? null : id);
                  }
                }}
              >
                {/* Color preview box */}
                <div
                  className="color-preview"
                  style={{
                    backgroundColor: style?.color || '#3B82F6',
                    width: '24px',
                    height: '24px',
                  }}
                  aria-hidden="true"
                />

                {/* Trajectory info */}
                <div className="trajectory-info">
                  <div className="trajectory-label">{displayName}</div>
                  <div className="trajectory-meta">
                    {pointCount} points
                  </div>
                </div>

                {/* Line style preview */}
                <svg
                  width="40"
                  height="24"
                  className="line-style-preview"
                  aria-label={`Line style: ${style?.dash || 'solid'}`}
                >
                  <line
                    x1="0"
                    y1="12"
                    x2="40"
                    y2="12"
                    stroke={style?.color || '#3B82F6'}
                    strokeWidth={Math.min(style?.width || 2, 3)}
                    strokeDasharray={getDashArray(style?.dash)}
                  />
                </svg>
              </div>
            );
          })}
        </div>
      </div>

      {/* Style Editor Section */}
      {selectedId && selectedStyle && (
        <div className="style-editor-section">
          <div className="style-editor-header">
            <h3>Edit Style</h3>
            <button
              className="reset-button"
              onClick={() => onResetStyle(selectedId)}
              aria-label="Reset style for selected trajectory"
            >
              Reset
            </button>
          </div>

          <div className="style-editor">
            {/* Color picker */}
            <div className="style-control">
              <label htmlFor="color-picker">Color</label>
              <div className="color-picker-wrapper">
                <input
                  id="color-picker"
                  type="color"
                  value={selectedStyle.color}
                  onChange={(e) =>
                    onUpdateStyle(selectedId, { color: e.target.value })
                  }
                  aria-label="Trajectory color"
                />
                <span className="color-value">{selectedStyle.color}</span>
              </div>
            </div>

            {/* Width slider */}
            <div className="style-control">
              <label htmlFor="width-slider">
                Width: {selectedStyle.width.toFixed(1)}
              </label>
              <input
                id="width-slider"
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={selectedStyle.width}
                onChange={(e) =>
                  onUpdateStyle(selectedId, {
                    width: parseFloat(e.target.value),
                  })
                }
                aria-label="Trajectory width"
              />
            </div>

            {/* Line style dropdown */}
            <div className="style-control">
              <label htmlFor="line-style-select">Line Style</label>
              <select
                id="line-style-select"
                value={selectedStyle.dash}
                onChange={(e) =>
                  onUpdateStyle(selectedId, { dash: e.target.value as LineStyle })
                }
                aria-label="Trajectory line style"
              >
                <option value="solid">Solid</option>
                <option value="dash">Dash</option>
                <option value="dot">Dot</option>
                <option value="dashdot">Dash-Dot</option>
                <option value="longdash">Long Dash</option>
                <option value="longdashdot">Long Dash-Dot</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Global Actions Section */}
      <div className="global-actions-section">
        <button
          className="reset-all-button"
          onClick={onResetAll}
          aria-label="Reset all trajectory styles"
        >
          Reset All Styles
        </button>
      </div>
    </div>
  );
}