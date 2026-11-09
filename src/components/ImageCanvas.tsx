import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import {
  clientToImage,
  computeCanvasLayout,
  isInsideImage,
  type Point,
  type Size,
} from '../geometry/imageSpace'
import type { LoadedImage } from '../image/loadImage'
import { nearestPointIndex } from '../points/editPoints'
import { drawScene, type SceneHighlight } from '../render/drawScene'
import type { KdSplitSegment } from '../trees/kdtree'
import type { RTreeBox } from '../trees/rtree'

/** Pointer hit radius in CSS pixels. */
const HIT_RADIUS = 9

interface ImageCanvasProps {
  image: LoadedImage | null
  points: readonly Point[]
  /** k-d tree split lines in image pixels, deepest first. Empty when the tree is hidden. */
  kdSegments: readonly KdSplitSegment[]
  /** R-tree boxes in image pixels, highest level first. Empty when the tree is hidden. */
  rtreeBoxes: readonly RTreeBox[]
  /** Shading for what the latest build step added, when stepping through. */
  highlight?: SceneHighlight | null
  /** Describes the overlay for screen readers, e.g. "k-d tree with 8 leaves". */
  overlayLabel?: string
  /** Shown when there is no image. */
  emptyMessage?: string
  /** Called with the pointer position in image pixels, or null when it leaves the image. */
  onPointerMove?: (point: Point | null) => void
  onScaleChange?: (scale: number | null) => void
  /** Called on click with the position and hit radius, both in image pixels. */
  onImageClick?: (point: Point, hitRadius: number) => void
}

/**
 * Overlays keep a constant screen size, but shrink (down to half) when the
 * image is shown small, so they do not swamp the dots they mark.
 */
function screenCssToImage(scale: number) {
  return Math.min(1, Math.max(0.5, scale)) / scale
}

export function ImageCanvas({
  image,
  points,
  kdSegments,
  rtreeBoxes,
  highlight,
  overlayLabel,
  emptyMessage = 'Upload a PNG or JPG to start.',
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
    if (ctx) {
      drawScene(ctx, image, layout.backingSize, screenCssToImage(layout.scale), {
        points,
        kdSegments,
        rtreeBoxes,
        highlight,
        hoveredIndex,
      })
    }
  }, [image, layout, points, kdSegments, rtreeBoxes, highlight, hoveredIndex])

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
        <p className="canvas-empty">{emptyMessage}</p>
      )}
    </div>
  )
}
