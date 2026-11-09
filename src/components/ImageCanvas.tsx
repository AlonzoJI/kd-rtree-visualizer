import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import {
  clientToImage,
  computeCanvasLayout,
  imageToBackingTransform,
  isInsideImage,
  type Point,
  type Size,
} from '../geometry/imageSpace'
import type { LoadedImage } from '../image/loadImage'
import { nearestPointIndex } from '../points/editPoints'
import { drawKdSplits } from '../render/kdTreeStyle'
import { drawRTreeBoxes } from '../render/rtreeStyle'
import type { KdSplitSegment } from '../trees/kdtree'
import type { RTreeBox } from '../trees/rtree'

/** Marker and hit sizes are in CSS pixels so they look the same at any zoom. */
const MARKER_RADIUS = 5
const MARKER_STROKE = 2
const HOVER_RADIUS = 7
const HIT_RADIUS = 9
const MARKER_COLOR = '#ff2d55'
const HALO_COLOR = 'rgba(255, 255, 255, 0.9)'

interface ImageCanvasProps {
  image: LoadedImage | null
  points: readonly Point[]
  /** k-d tree split lines in image pixels, deepest first. Empty when the tree is hidden. */
  kdSegments: readonly KdSplitSegment[]
  /** R-tree boxes in image pixels, highest level first. Empty when the tree is hidden. */
  rtreeBoxes: readonly RTreeBox[]
  /** Describes the overlay for screen readers, e.g. "k-d tree with 8 leaves". */
  overlayLabel?: string
  /** Called with the pointer position in image pixels, or null when it leaves the image. */
  onPointerMove?: (point: Point | null) => void
  onScaleChange?: (scale: number | null) => void
  /** Called on click with the position and hit radius, both in image pixels. */
  onImageClick?: (point: Point, hitRadius: number) => void
}

interface SceneOptions {
  image: LoadedImage
  backingSize: Size
  /** CSS pixels per image pixel, used to keep markers a constant size on screen. */
  scale: number
  points: readonly Point[]
  kdSegments: readonly KdSplitSegment[]
  rtreeBoxes: readonly RTreeBox[]
  hoveredIndex: number
}

/**
 * Draws one frame: image, then tree overlay, then point markers on top.
 * After `setTransform`, every call uses image pixel coordinates.
 */
function drawScene(
  ctx: CanvasRenderingContext2D,
  { image, backingSize, scale, points, kdSegments, rtreeBoxes, hoveredIndex }: SceneOptions,
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

  // Overlays keep a constant screen size, but shrink (down to half) when the
  // image is shown small, so they do not swamp the dots they mark.
  const cssToImage = Math.min(1, Math.max(0.5, scale)) / scale
  drawKdSplits(ctx, kdSegments, cssToImage)
  drawRTreeBoxes(ctx, rtreeBoxes, cssToImage)

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

  const hovered = points[hoveredIndex]
  if (hovered) {
    ctx.beginPath()
    ctx.arc(hovered.x, hovered.y, HOVER_RADIUS * cssToImage, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 45, 85, 0.35)'
    ctx.fill()
    ctx.stroke()
  }
}

export function ImageCanvas({
  image,
  points,
  kdSegments,
  rtreeBoxes,
  overlayLabel,
  onPointerMove,
  onScaleChange,
  onImageClick,
}: ImageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [available, setAvailable] = useState<Size>({ width: 0, height: 0 })
  const [hoveredIndex, setHoveredIndex] = useState(-1)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setAvailable({ width, height })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo(
    () => (image ? computeCanvasLayout(image, available, window.devicePixelRatio) : null),
    [image, available],
  )

  useEffect(() => {
    onScaleChange?.(layout ? layout.scale : null)
  }, [layout, onScaleChange])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image || !layout || layout.scale <= 0) return
    // Assigning width or height clears the canvas, so only do it when the size changes.
    if (canvas.width !== layout.backingSize.width) canvas.width = layout.backingSize.width
    if (canvas.height !== layout.backingSize.height) canvas.height = layout.backingSize.height
    const ctx = canvas.getContext('2d')
    if (ctx) drawScene(ctx, { image, backingSize: layout.backingSize, scale: layout.scale, points, kdSegments, rtreeBoxes, hoveredIndex })
  }, [image, layout, points, kdSegments, rtreeBoxes, hoveredIndex])

  function toImagePoint(event: MouseEvent<HTMLCanvasElement>): Point | null {
    if (!image) return null
    const point = clientToImage({ x: event.clientX, y: event.clientY }, event.currentTarget.getBoundingClientRect(), image)
    return isInsideImage(point, image) ? point : null
  }

  function hitRadius() {
    return layout && layout.scale > 0 ? HIT_RADIUS / layout.scale : 0
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const point = toImagePoint(event)
    onPointerMove?.(point)
    setHoveredIndex(point ? nearestPointIndex(points, point, hitRadius()) : -1)
  }

  function handleClick(event: MouseEvent<HTMLCanvasElement>) {
    const point = toImagePoint(event)
    if (!point) return
    onImageClick?.(point, hitRadius())
    // The point under the cursor just changed; recompute hover on the next move.
    setHoveredIndex(-1)
  }

  return (
    <div ref={containerRef} className="canvas-area">
      {image && layout ? (
        <canvas
          ref={canvasRef}
          className={`image-canvas${hoveredIndex >= 0 ? ' is-over-point' : ''}`}
          style={{ width: layout.cssSize.width, height: layout.cssSize.height }}
          aria-label={[
            `${image.fileName}, ${image.width} by ${image.height} pixels`,
            `${points.length} points marked`,
            overlayLabel,
          ]
            .filter(Boolean)
            .join(', ')}
          role="img"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => {
            onPointerMove?.(null)
            setHoveredIndex(-1)
          }}
          onClick={handleClick}
        />
      ) : (
        <p className="canvas-empty">Upload a PNG or JPG to start.</p>
      )}
    </div>
  )
}
