import { useId } from 'react'
import { rtreeLevelStyle } from '../render/rtreeStyle'
import type { RTreeAnalysis } from '../trees/rtree'

export type RTreeMethod = 'str' | 'quadratic'

const RTREE_METHODS: readonly (readonly [RTreeMethod, string])[] = [
  ['str', 'STR bulk load'],
  ['quadratic', 'Quadratic insertion'],
]

export interface RTreeLevelInfo {
  level: number
  boxes: number
}

interface RTreePanelProps {
  method: RTreeMethod
  onMethodChange: (method: RTreeMethod) => void
  /** Analysis of each method's tree over the same points, for side-by-side comparison. */
  analyses: Record<RTreeMethod, RTreeAnalysis>
  /** Levels of the selected tree, highest first. */
  levels: RTreeLevelInfo[]
  hiddenLevels: ReadonlySet<number>
  onToggleLevel: (level: number) => void
}

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function percent(fraction: number) {
  return `${Math.round(fraction * 100)}%`
}

function lowestFill(analysis: RTreeAnalysis) {
  const nodes = analysis.nodes.length > 1 ? analysis.nodes.filter((node) => !node.isRoot) : analysis.nodes
  return Math.min(...nodes.map((node) => node.fill))
}

const STAT_ROWS: readonly (readonly [string, (analysis: RTreeAnalysis) => string])[] = [
  ['Height', (a) => String(a.height)],
  ['Leaves', (a) => String(a.leafCount)],
  ['Average fill', (a) => percent(a.averageFill)],
  ['Lowest fill', (a) => percent(lowestFill(a))],
  ['Leaf area, px²', (a) => numberFormat.format(a.totalLeafArea)],
  ['Overlap, px²', (a) => numberFormat.format(a.totalOverlap)],
]

function levelLabel(level: number, topLevel: number) {
  if (level === 0 && topLevel === 0) return 'Level 0 (root leaf)'
  if (level === 0) return 'Level 0 (leaves)'
  if (level === topLevel) return `Level ${level} (root)`
  return `Level ${level}`
}

/** A short sample of the line style, matching the canvas. */
function LevelSwatch({ level }: { level: number }) {
  const style = rtreeLevelStyle(level)
  return (
    <svg className="rtree-swatch" width="28" height="10" viewBox="0 0 28 10" aria-hidden="true">
      <line x1="0" y1="5" x2="28" y2="5" stroke="#fff" strokeOpacity="0.85" strokeWidth={style.width + 2} />
      <line
        x1="0"
        y1="5"
        x2="28"
        y2="5"
        stroke={style.color}
        strokeWidth={style.width}
        strokeDasharray={style.dash.join(' ') || undefined}
      />
    </svg>
  )
}

export function RTreePanel({ method, onMethodChange, analyses, levels, hiddenLevels, onToggleLevel }: RTreePanelProps) {
  const methodId = useId()
  const topLevel = levels.length > 0 ? levels[0].level : 0

  return (
    <section className="sidebar-section">
      <h2>R-tree</h2>

      <div className="field">
        <label htmlFor={methodId}>Build method</label>
        <select
          id={methodId}
          className="text-input"
          value={method}
          onChange={(event) => onMethodChange(event.target.value as RTreeMethod)}
        >
          {RTREE_METHODS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p className="hint">Max 5 entries per node, min 2 (40%).</p>
      </div>

      <table className="rtree-stats" data-testid="rtree-stats">
        <caption className="visually-hidden">Both build methods on the current points</caption>
        <thead>
          <tr>
            <td />
            {RTREE_METHODS.map(([value]) => (
              <th key={value} scope="col" className={value === method ? 'is-selected' : undefined}>
                {value === 'str' ? 'STR' : 'Quadratic'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STAT_ROWS.map(([label, format]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {RTREE_METHODS.map(([value]) => (
                <td key={value} className={value === method ? 'is-selected' : undefined}>
                  {format(analyses[value])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Overlap adds up the shared area of each pair of sibling boxes.</p>

      <h3 className="subheading">Levels</h3>
      {levels.length === 0 ? (
        <p className="hint">No boxes yet. Add some points.</p>
      ) : (
        <ul className="rtree-legend" aria-label="R-tree levels">
          {levels.map(({ level, boxes }) => (
            <li key={level}>
              <label>
                <input type="checkbox" checked={!hiddenLevels.has(level)} onChange={() => onToggleLevel(level)} />
                <LevelSwatch level={level} />
                <span>{levelLabel(level, topLevel)}</span>
                <span className="kd-legend-detail">
                  {boxes} {boxes === 1 ? 'box' : 'boxes'}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
