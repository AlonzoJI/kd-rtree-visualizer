import type { RTreeBox } from '../trees/rtree'

/**
 * One-hue ordinal ramp for R-tree levels, keyed to the level number so a
 * level keeps its color when the build method changes the tree height.
 * Leaves (level 0) get the lightest violet; each level up gets darker.
 * Violet keeps R-tree boxes apart from the k-d blues and the red point
 * markers. Checked with the dataviz palette validator in ordinal mode on a
 * white surface; levels 4 and up share the darkest step.
 */
export const RTREE_LEVEL_COLORS = ['#9f94ea', '#7a6ae0', '#5643c4', '#3f2c9a', '#2a1b6e'] as const

/**
 * Distance from a point's center to its leaf box. The marker ring reaches
 * about 7 px (5 px radius, stroke and white outline), so this leaves a
 * visible 3 px gap.
 */
const LEAF_PADDING = 10
/** Each level up sits this much further out, so nested boxes do not draw on top of each other. */
const PADDING_STEP = 4

export interface RTreeLevelStyle {
  color: string
  /** Line width in CSS pixels. */
  width: number
  /** Dash pattern in CSS pixels; empty for solid lines. */
  dash: number[]
  /** Gap between the bounding rectangle and the drawn box, in CSS pixels. */
  padding: number
}

export function rtreeLevelStyle(level: number): RTreeLevelStyle {
  return {
    color: RTREE_LEVEL_COLORS[Math.min(level, RTREE_LEVEL_COLORS.length - 1)],
    width: level === 0 ? 1.25 : Math.min(4, 1.5 + 0.75 * level),
    dash: level === 0 ? [] : [7, 4],
    padding: LEAF_PADDING + PADDING_STEP * level,
  }
}

/**
 * Draws boxes in the order given (callers pass them highest level first, so
 * leaves end up on top). The context must already map image pixels;
 * `cssToImage` converts CSS pixel sizes to image pixels.
 */
export function drawRTreeBoxes(ctx: CanvasRenderingContext2D, boxes: readonly RTreeBox[], cssToImage: number) {
  ctx.lineJoin = 'miter'
  let index = 0
  while (index < boxes.length) {
    // Batch one level at a time: its white outline first, then its color.
    const level = boxes[index].level
    const style = rtreeLevelStyle(level)
    const pad = style.padding * cssToImage
    const path = new Path2D()
    while (index < boxes.length && boxes[index].level === level) {
      const { minX, minY, maxX, maxY } = boxes[index].rect
      path.rect(minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad)
      index++
    }
    const dash = style.dash.map((length) => length * cssToImage)
    ctx.setLineDash([])
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.lineWidth = (style.width + 2) * cssToImage
    ctx.stroke(path)
    ctx.setLineDash(dash)
    ctx.strokeStyle = style.color
    ctx.lineWidth = style.width * cssToImage
    ctx.stroke(path)
  }
  ctx.setLineDash([])
}
