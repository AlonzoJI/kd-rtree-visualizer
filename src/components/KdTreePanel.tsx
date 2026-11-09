import { useId } from 'react'
import { kdLevelStyle } from '../render/kdTreeStyle'
import type { Axis, KdLevelSummary, KdTreeSummary } from '../trees/kdtree'

export type ViewMode = 'points' | 'kd'

interface KdTreePanelProps {
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
  capacityInput: string
  capacityError: string | null
  /** The capacity the current tree was built with (last valid input). */
  leafCapacity: number
  onCapacityInputChange: (value: string) => void
  startAxis: Axis
  onStartAxisChange: (axis: Axis) => void
  summary: KdTreeSummary | null
}

function formatLeafSizes({ minLeafSize, maxLeafSize, meanLeafSize }: KdTreeSummary) {
  if (minLeafSize === maxLeafSize) return String(minLeafSize)
  return `${minLeafSize} to ${maxLeafSize} (avg ${Math.round(meanLeafSize * 10) / 10})`
}

function formatLevel({ axes, splits }: KdLevelSummary) {
  return `${axes.join(' and ')} · ${splits} ${splits === 1 ? 'split' : 'splits'}`
}

export function KdTreePanel({
  mode,
  onModeChange,
  capacityInput,
  capacityError,
  leafCapacity,
  onCapacityInputChange,
  startAxis,
  onStartAxisChange,
  summary,
}: KdTreePanelProps) {
  const capacityId = useId()
  const capacityErrorId = useId()
  const modeName = useId()
  const axisName = useId()

  return (
    <>
      <section className="sidebar-section">
        <h2>View</h2>
        <fieldset className="segmented">
          <legend className="visually-hidden">What to draw</legend>
          {(
            [
              ['points', 'Points only'],
              ['kd', 'k-d tree'],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name={modeName}
                value={value}
                checked={mode === value}
                onChange={() => onModeChange(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      </section>

      {mode === 'kd' && (
        <section className="sidebar-section">
          <h2>k-d tree</h2>

          <div className="field">
            <label htmlFor={capacityId}>Leaf capacity</label>
            <input
              id={capacityId}
              className="text-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={capacityInput}
              aria-invalid={capacityError !== null}
              aria-describedby={capacityError ? capacityErrorId : undefined}
              onChange={(event) => onCapacityInputChange(event.target.value)}
            />
            {capacityError && (
              <p id={capacityErrorId} className="error">
                {capacityError}
              </p>
            )}
          </div>

          <fieldset className="field">
            <legend>First split</legend>
            <div className="segmented">
              {(['x', 'y'] as const).map((axis) => (
                <label key={axis}>
                  <input
                    type="radio"
                    name={axisName}
                    value={axis}
                    checked={startAxis === axis}
                    onChange={() => onStartAxisChange(axis)}
                  />
                  <span>{axis}</span>
                </label>
              ))}
            </div>
            <p className="hint">
              {startAxis === 'x' ? 'The first cut is a vertical line.' : 'The first cut is a horizontal line.'}
            </p>
          </fieldset>

          {summary && (
            <>
              <dl className="details kd-summary" data-testid="kd-summary">
                <dt>Depth</dt>
                <dd>{summary.depth}</dd>
                <dt>Leaves</dt>
                <dd>{summary.leafCount}</dd>
                <dt>Points per leaf</dt>
                <dd>{formatLeafSizes(summary)}</dd>
              </dl>
              {summary.maxLeafSize > leafCapacity && (
                <p className="hint">Some leaves hold identical points, which no line can separate.</p>
              )}

              <h3 className="subheading">Levels</h3>
              {summary.levels.length === 0 ? (
                <p className="hint">No splits yet. Add more points than the leaf capacity.</p>
              ) : (
                <ol className="kd-legend" aria-label="Split levels">
                  {summary.levels.map((level) => {
                    const style = kdLevelStyle(level.depth)
                    return (
                      <li key={level.depth}>
                        <span
                          className="kd-swatch"
                          style={{ background: style.color, height: Math.max(2, style.width) }}
                          aria-hidden="true"
                        />
                        <span>Level {level.depth}</span>
                        <span className="kd-legend-detail">{formatLevel(level)}</span>
                      </li>
                    )
                  })}
                </ol>
              )}
            </>
          )}
        </section>
      )}
    </>
  )
}
