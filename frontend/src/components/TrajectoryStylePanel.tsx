import React, { useState, useCallback, useEffect } from "react";
import { TrajectoryStyles, TrajectoryStyle } from "../types";

type Props = {
  trajectoryStyles: TrajectoryStyles;
  onStyleChange: (index: string, style: Partial<TrajectoryStyle>) => void;
  onResetAll: () => void;
  onExport: () => void;
  onImport: (styles: TrajectoryStyles) => void;
  trajectoryCount: number;
  trajectoryNames: string[];
};

const defaultStyle: TrajectoryStyle = {
  color: '#1f77b4', // Plotly's default blue
  lineStyle: 'solid',
  width: 2
};

const colors = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
];

const lineStyles = [
  { value: 'solid' as const, label: 'Solid', dash: 'solid' },
  { value: 'dashed' as const, label: 'Dashed', dash: 'dash' },
  { value: 'dashdot' as const, label: 'Dash-dot', dash: 'dashdot' },
  { value: 'dotted' as const, label: 'Dotted', dash: 'dot' }
];

const TrajectoryStylePanel: React.FC<Props> = ({
  trajectoryStyles,
  onStyleChange,
  onResetAll,
  onExport,
  onImport,
  trajectoryCount,
  trajectoryNames
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleExpanded = useCallback((index: string) => {
    setExpanded(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }, []);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const styles = JSON.parse(e.target?.result as string);
            onImport(styles);
          } catch (err) {
            alert('Invalid JSON file');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [onImport]);

  const handleExport = useCallback(() => {
    const dataStr = JSON.stringify(trajectoryStyles, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'trajectory-styles.json';
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }, [trajectoryStyles]);

  const resetIndividual = useCallback((index: string) => {
    onStyleChange(index, defaultStyle);
  }, [onStyleChange]);

  if (trajectoryCount === 0) return null;

  return (
    <div className="trajectory-style-panel">
      <div className="panel-header">
        <h3>Trajectory Styles</h3>
        <div className="panel-actions">
          <button
            type="button"
            onClick={onResetAll}
            className="reset-all-btn"
            aria-label="Reset all styles to default"
          >
            Reset All
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="export-btn"
            aria-label="Export styles as JSON"
          >
            Export
          </button>
          <button
            type="button"
            onClick={handleImport}
            className="import-btn"
            aria-label="Import styles from JSON"
          >
            Import
          </button>
        </div>
      </div>

      <div className="style-controls" role="region" aria-label="Trajectory style controls">
        {Array.from({ length: trajectoryCount }, (_, i) => {
          const index = i.toString();
          const style = trajectoryStyles[index] || defaultStyle;
          const name = trajectoryNames[i] || `Trajectory ${i + 1}`;
          const isExpanded = expanded.has(index);

          return (
            <div key={index} className={`trajectory-control ${isMobile ? 'mobile' : 'desktop'}`}>
              {isMobile ? (
                <details
                  open={isExpanded}
                  onToggle={(e) => {
                    const target = e.target as HTMLDetailsElement;
                    setExpanded(prev => {
                      const newSet = new Set(prev);
                      if (target.open) {
                        newSet.add(index);
                      } else {
                        newSet.delete(index);
                      }
                      return newSet;
                    });
                  }}
                >
                  <summary className="trajectory-summary">
                    <span className="trajectory-name">{name}</span>
                    <div
                      className="style-preview"
                      style={{
                        backgroundColor: style.color,
                        borderStyle: style.lineStyle === 'solid' ? 'solid' : style.lineStyle === 'dashed' ? 'dashed' : style.lineStyle === 'dashdot' ? 'dashed' : 'dotted',
                        borderWidth: '2px',
                        borderColor: style.color,
                        height: `${style.width * 2}px`,
                        minHeight: '4px'
                      }}
                      aria-label={`Current style: ${style.color}, ${style.lineStyle}, width ${style.width}`}
                    />
                  </summary>
                  <div className="trajectory-controls">
                    <div className="control-group">
                      <label htmlFor={`color-${index}`}>Color</label>
                      <input
                        id={`color-${index}`}
                        type="color"
                        value={style.color}
                        onChange={(e) => onStyleChange(index, { color: e.target.value })}
                        aria-label={`Color for ${name}`}
                      />
                    </div>
                    <div className="control-group">
                      <label htmlFor={`style-${index}`}>Line Style</label>
                      <select
                        id={`style-${index}`}
                        value={style.lineStyle}
                        onChange={(e) => onStyleChange(index, { lineStyle: e.target.value as TrajectoryStyle['lineStyle'] })}
                        aria-label={`Line style for ${name}`}
                      >
                        {lineStyles.map(ls => (
                          <option key={ls.value} value={ls.value}>{ls.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="control-group">
                      <label htmlFor={`width-${index}`}>Width</label>
                      <input
                        id={`width-${index}`}
                        type="range"
                        min="0.5"
                        max="10"
                        step="0.5"
                        value={style.width}
                        onChange={(e) => onStyleChange(index, { width: parseFloat(e.target.value) })}
                        aria-label={`Line width for ${name}`}
                      />
                      <span className="width-value">{style.width}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => resetIndividual(index)}
                      className="reset-btn"
                      aria-label={`Reset ${name} to default style`}
                    >
                      Reset
                    </button>
                  </div>
                </details>
              ) : (
                <div className="trajectory-row">
                  <span className="trajectory-name">{name}</span>
                  <div className="controls-row">
                    <div className="control-item">
                      <label htmlFor={`color-${index}`}>Color</label>
                      <input
                        id={`color-${index}`}
                        type="color"
                        value={style.color}
                        onChange={(e) => onStyleChange(index, { color: e.target.value })}
                        aria-label={`Color for ${name}`}
                      />
                    </div>
                    <div className="control-item">
                      <label htmlFor={`style-${index}`}>Style</label>
                      <select
                        id={`style-${index}`}
                        value={style.lineStyle}
                        onChange={(e) => onStyleChange(index, { lineStyle: e.target.value as TrajectoryStyle['lineStyle'] })}
                        aria-label={`Line style for ${name}`}
                      >
                        {lineStyles.map(ls => (
                          <option key={ls.value} value={ls.value}>{ls.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="control-item">
                      <label htmlFor={`width-${index}`}>Width</label>
                      <input
                        id={`width-${index}`}
                        type="range"
                        min="0.5"
                        max="10"
                        step="0.5"
                        value={style.width}
                        onChange={(e) => onStyleChange(index, { width: parseFloat(e.target.value) })}
                        aria-label={`Line width for ${name}`}
                      />
                      <span className="width-value">{style.width}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => resetIndividual(index)}
                      className="reset-btn"
                      aria-label={`Reset ${name} to default style`}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TrajectoryStylePanel;