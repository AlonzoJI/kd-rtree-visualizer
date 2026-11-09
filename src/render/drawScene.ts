import { imageToBackingTransform, type Point, type Size } from '../geometry/imageSpace'
import type { KdSplitSegment, Region } from '../trees/kdtree'
import type { RTreeBox } from '../trees/rtree'
import { drawKdSplits } from './kdTreeStyle'
import { drawRTreeBoxes, rtreeLevelStyle } from './rtreeStyle'

/** Point marker sizes in CSS pixels. */
export const MARKER_RADIUS = 5
const MARKER_STROKE = 2
const HOVER_RADIUS = 7
export const MARKER_COLOR = '#ff2d55'
const HALO_COLOR = 'rgba(255, 255, 255, 0.9)'

export interface SceneImage extends Size {
  bitmap: CanvasImageSource
}

/** A shaded area marking what the latest build step added. */
export interface SceneHighlight {
  rect: Region
  /** Extra space around the rectangle, in CSS pixels. */
  padding: number
  fill: string
}

export interface SceneContent {
  points: readonly Point[]
  kdSegments: readonly KdSplitSegment[]
  rtreeBoxes: readonly RTreeBox[]
  highlight?: SceneHighlight | null
  /** Index of the point under the pointer, or -1. */
  hoveredIndex?: number
}

export function kdHighlight(rect: Region): SceneHighlight {
  return { rect, padding: 0, fill: 'rgba(57, 135, 229, 0.16)' }
}

export function rtreeHighlight(rect: Region, level: number): SceneHighlight {
  return { rect, padding: rtreeLevelStyle(level).padding, fill: 'rgba(122, 106, 224, 0.18)' }
}

/**
 * Draws one frame: image, step highlight, tree overlay, then point markers on
 * top. After `setTransform`, every call uses image pixel coordinates.
 * `cssToImage` converts the overlay's CSS pixel sizes (line widths, marker
 * radius, padding) to image pixels.
 */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  image: SceneImage,
  backingSize: Size,
  cssToImage: number,
  { points, kdSegments, rtreeBoxes, highlight, hoveredIndex = -1 }: SceneContent,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, backingSize.width, backingSize.height)
  ctx.setTransform(...imageToBackingTransform(image, backingSize))

  // Transparent areas show as white, matching what detection saw.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, image.width, image.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image.bitmap, 0, 0, image.width, image.height)

  if (highlight) {
    const pad = highlight.padding * cssToImage
    const { minX, minY, maxX, maxY } = highlight.rect
    ctx.fillStyle = highlight.fill
    ctx.fillRect(minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad)
  }

  drawKdSplits(ctx, kdSegments, cssToImage)
  drawRTreeBoxes(ctx, rtreeBoxes, cssToImage)
  drawPointMarkers(ctx, points, cssToImage)

  const hovered = points[hoveredIndex]
  if (hovered) {
    ctx.beginPath()
    ctx.arc(hovered.x, hovered.y, HOVER_RADIUS * cssToImage, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 45, 85, 0.35)'
    ctx.fill()
    ctx.stroke()
  }
}

export function drawPointMarkers(ctx: CanvasRenderingContext2D, points: readonly Point[], cssToImage: number) {
  if (points.length === 0) return
  const markers = new Path2D()
  for (const point of points) {
    markers.moveTo(point.x + MARKER_RADIUS * cssToImage, point.y)
    markers.arc(point.x, point.y, MARKER_RADIUS * cssToImage, 0, Math.PI * 2)
  }
  ctx.lineWidth = (MARKER_STROKE + 2) * cssToImage
  ctx.strokeStyle = HALO_COLOR
  ctx.stroke(markers)
  ctx.lineWidth = MARKER_STROKE * cssToImage
  ctx.strokeStyle = MARKER_COLOR
  ctx.stroke(markers)
}
