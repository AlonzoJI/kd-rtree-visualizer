import type { Point, Size } from '../geometry/imageSpace'
import type { Axis, KdTreeSummary } from '../trees/kdtree'
import type { RTreeAnalysis } from '../trees/rtree'
import { MARKER_COLOR, MARKER_RADIUS } from './drawScene'
import { kdLevelStyle } from './kdTreeStyle'
import { rtreeLevelStyle } from './rtreeStyle'

export type LegendSwatch = { kind: 'marker' } | { kind: 'line'; color: string; width: number; dash: number[] }

export interface LegendRow {
  swatch: LegendSwatch
  label: string
}

/** Content of the legend drawn onto exported images. */
export interface Legend {
  title: string
  lines: string[]
  rows: LegendRow[]
}

export interface StepInfo {
  step: number
  total: number
}

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}

function pointRow(count: number): LegendRow {
  return { swatch: { kind: 'marker' }, label: plural(count, 'point') }
}

function stepLine(step: StepInfo | null | undefined) {
  return step ? [`Build step ${step.step} of ${step.total}`] : []
}

export function pointsLegend(pointCount: number): Legend {
  return { title: 'Points', lines: [], rows: [pointRow(pointCount)] }
}

export function kdLegend(options: {
  summary: KdTreeSummary
  leafCapacity: number
  startAxis: Axis
  pointCount: number
  step?: StepInfo | null
  /** When stepping, only the depths drawn so far; other levels are left out. */
  shownDepths?: ReadonlySet<number>
}): Legend {
  const { summary, leafCapacity, startAxis, pointCount, step, shownDepths } = options
  return {
    title: 'k-d tree',
    lines: [
      `Leaf capacity ${leafCapacity}, first split on ${startAxis}`,
      `${plural(summary.leafCount, 'leaf', 'leaves')}, depth ${summary.depth}`,
      ...stepLine(step),
    ],
    rows: [
      ...summary.levels
        .filter((level) => !shownDepths || shownDepths.has(level.depth))
        .map((level): LegendRow => {
          const { color, width } = kdLevelStyle(level.depth)
          return {
            swatch: { kind: 'line', color, width, dash: [] },
            label: `Level ${level.depth}: ${level.axes.join(' and ')} split${level.splits === 1 ? '' : 's'}`,
          }
        }),
      pointRow(pointCount),
    ],
  }
}

export function rtreeLegend(options: {
  methodLabel: string
  analysis: RTreeAnalysis
  /** Levels of the tree, highest first, with how many boxes each has. */
  levels: readonly { level: number; boxes: number }[]
  hiddenLevels: ReadonlySet<number>
  pointCount: number
  step?: StepInfo | null
}): Legend {
  const { methodLabel, analysis, levels, hiddenLevels, pointCount, step } = options
  const topLevel = levels.length > 0 ? levels[0].level : 0
  return {
    title: `R-tree, ${methodLabel}`,
    lines: [
      `${plural(analysis.leafCount, 'leaf', 'leaves')}, height ${analysis.height}`,
      `Leaf area ${numberFormat.format(analysis.totalLeafArea)} px², overlap ${numberFormat.format(analysis.totalOverlap)} px²`,
      ...stepLine(step),
    ],
    rows: [
      ...levels
        .filter(({ level }) => !hiddenLevels.has(level))
        .map(({ level, boxes }): LegendRow => {
          const { color, width, dash } = rtreeLevelStyle(level)
          const name = level === 0 ? 'Level 0 (leaves)' : level === topLevel ? `Level ${level} (root)` : `Level ${level}`
          return { swatch: { kind: 'line', color, width, dash }, label: `${name}: ${plural(boxes, 'box', 'boxes')}` }
        }),
      pointRow(pointCount),
    ],
  }
}

export type Corner = 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left'

const CORNERS: readonly Corner[] = ['top-right', 'bottom-right', 'top-left', 'bottom-left']

/** Top-left position of a panel placed in `corner`, `margin` away from the image edges. */
export function cornerPosition(corner: Corner, image: Size, panel: Size, margin: number): Point {
  return {
    x: corner.endsWith('left') ? margin : image.width - panel.width - margin,
    y: corner.startsWith('top') ? margin : image.height - panel.height - margin,
  }
}

/**
 * The corner where the panel covers the fewest points (counting points whose
 * marker would touch it). Ties go to the first corner in the order top-right,
 * bottom-right, top-left, bottom-left.
 */
export function chooseLegendCorner(
  points: readonly Point[],
  image: Size,
  panel: Size,
  margin: number,
  clearance: number,
): Corner {
  let best = CORNERS[0]
  let bestCount = Infinity
  for (const corner of CORNERS) {
    const { x, y } = cornerPosition(corner, image, panel, margin)
    const covered = points.filter(
      (point) =>
        point.x >= x - clearance &&
        point.x <= x + panel.width + clearance &&
        point.y >= y - clearance &&
        point.y <= y + panel.height + clearance,
    ).length
    if (covered < bestCount) {
      bestCount = covered
      best = corner
    }
  }
  return best
}

/** Legend metrics in CSS pixels; multiplied by the export scale when drawn. */
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const PADDING = 12
const TITLE_SIZE = 15
const TEXT_SIZE = 12.5
const LINE_HEIGHT = 18
const SWATCH_WIDTH = 28
const SWATCH_GAP = 8
const MARGIN = 12

/**
 * Draws the legend panel onto an image-space context (1 unit = 1 image
 * pixel), in the corner that hides the fewest points. `scale` multiplies all
 * legend sizes so it stays readable on large images.
 */
export function drawLegend(
  ctx: CanvasRenderingContext2D,
  legend: Legend,
  image: Size,
  points: readonly Point[],
  scale: number,
) {
  const s = (value: number) => value * scale
  const titleFont = `600 ${s(TITLE_SIZE)}px ${FONT}`
  const textFont = `${s(TEXT_SIZE)}px ${FONT}`

  ctx.font = titleFont
  let contentWidth = ctx.measureText(legend.title).width
  ctx.font = textFont
  for (const line of legend.lines) contentWidth = Math.max(contentWidth, ctx.measureText(line).width)
  for (const row of legend.rows) {
    contentWidth = Math.max(contentWidth, s(SWATCH_WIDTH + SWATCH_GAP) + ctx.measureText(row.label).width)
  }

  const textLines = 1 + legend.lines.length
  const panel = {
    width: contentWidth + s(PADDING * 2),
    height: s(PADDING * 2 + LINE_HEIGHT * (textLines + legend.rows.length) + (legend.rows.length > 0 ? 6 : 0)),
  }
  const corner = chooseLegendCorner(points, image, panel, s(MARGIN), s(MARKER_RADIUS + 2))
  const origin = cornerPosition(corner, image, panel, s(MARGIN))

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(origin.x, origin.y, panel.width, panel.height, s(6))
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)'
  ctx.fill()
  ctx.lineWidth = s(1)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)'
  ctx.stroke()

  ctx.textBaseline = 'middle'
  let y = origin.y + s(PADDING + LINE_HEIGHT / 2)
  const x = origin.x + s(PADDING)

  ctx.font = titleFont
  ctx.fillStyle = '#1d1d1b'
  ctx.fillText(legend.title, x, y)
  ctx.font = textFont
  ctx.fillStyle = '#5a5a55'
  for (const line of legend.lines) {
    y += s(LINE_HEIGHT)
    ctx.fillText(line, x, y)
  }
  if (legend.rows.length > 0) y += s(6)

  for (const row of legend.rows) {
    y += s(LINE_HEIGHT)
    drawSwatch(ctx, row.swatch, x, y, scale)
    ctx.fillStyle = '#1d1d1b'
    ctx.fillText(row.label, x + s(SWATCH_WIDTH + SWATCH_GAP), y)
  }
  ctx.restore()
}

function drawSwatch(ctx: CanvasRenderingContext2D, swatch: LegendSwatch, x: number, y: number, scale: number) {
  ctx.save()
  if (swatch.kind === 'marker') {
    ctx.beginPath()
    ctx.arc(x + (SWATCH_WIDTH / 2) * scale, y, MARKER_RADIUS * scale, 0, Math.PI * 2)
    ctx.lineWidth = 2 * scale
    ctx.strokeStyle = MARKER_COLOR
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + SWATCH_WIDTH * scale, y)
    ctx.setLineDash(swatch.dash.map((length) => length * scale))
    ctx.lineWidth = swatch.width * scale
    ctx.strokeStyle = swatch.color
    ctx.stroke()
  }
  ctx.restore()
}
