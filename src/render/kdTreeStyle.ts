import type { KdSplitSegment } from '../trees/kdtree'

/**
 * One-hue ordinal ramp for split depth: the root level is darkest, deeper
 * levels get lighter. Five steps is as many as stay distinguishable
 * (checked with the dataviz palette validator in ordinal mode on a white
 * surface), so levels past the fifth reuse the lightest blue and are told
 * apart by thickness alone.
 */
export const KD_LEVEL_COLORS = ['#0d366b', '#184f95', '#256abf', '#3987e5', '#6da7ec'] as const

/** Line widths in CSS pixels, thickest at the root. Deeper levels use the last value. */
const KD_LEVEL_WIDTHS = [4, 3, 2.25, 1.5, 1] as const

/** Extra width of the white outline drawn under each line, in CSS pixels. */
const HALO_EXTRA = 2

export interface KdLevelStyle {
  color: string
  /** Line width in CSS pixels. */
  width: number
}

export function kdLevelStyle(depth: number): KdLevelStyle {
  return {
    color: KD_LEVEL_COLORS[Math.min(depth, KD_LEVEL_COLORS.length - 1)],
    width: KD_LEVEL_WIDTHS[Math.min(depth, KD_LEVEL_WIDTHS.length - 1)],
  }
}

/**
 * Draws split lines in the order given (callers pass them deepest first, so
 * the root ends up on top). The context must already map image pixels;
 * `cssToImage` converts CSS pixel widths to image pixels.
 */
export function drawKdSplits(
  ctx: CanvasRenderingContext2D,
  segments: readonly KdSplitSegment[],
  cssToImage: number,
) {
  ctx.lineCap = 'butt'
  let index = 0
  while (index < segments.length) {
    // Batch one depth at a time: its white outline first, then its color.
    const depth = segments[index].depth
    const path = new Path2D()
    while (index < segments.length && segments[index].depth === depth) {
      const { x1, y1, x2, y2 } = segments[index]
      path.moveTo(x1, y1)
      path.lineTo(x2, y2)
      index++
    }
    const { color, width } = kdLevelStyle(depth)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.lineWidth = (width + HALO_EXTRA) * cssToImage
    ctx.stroke(path)
    ctx.strokeStyle = color
    ctx.lineWidth = width * cssToImage
    ctx.stroke(path)
  }
}
