import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import {
  clientToImage,
  computeCanvasLayout,
  imageToBackingTransform,
  isInsideImage,
  type Point,
  type Size,
} from '../geometry/imageSpace'
import type { LoadedImage } from '../image/loadImage'

interface ImageCanvasProps {
  image: LoadedImage | null
  /** Called with the pointer position in image pixels, or null when it leaves the image. */
  onPointerMove?: (point: Point | null) => void
  onScaleChange?: (scale: number | null) => void
}

/**
 * Draws one frame. The context transform is set so that every call after
 * `setTransform` uses image pixel coordinates. Future overlays (points, k-d
 * splits, R-tree boxes) belong after `drawImage`, in the same coordinates.
 */
function drawScene(ctx: CanvasRenderingContext2D, image: LoadedImage, backingSize: Size) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, backingSize.width, backingSize.height)
  ctx.setTransform(...imageToBackingTransform(image, backingSize))
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image.bitmap, 0, 0, image.width, image.height)
}

export function ImageCanvas({ image, onPointerMove, onScaleChange }: ImageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [available, setAvailable] = useState<Size>({ width: 0, height: 0 })

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
    if (!canvas || !image || !layout) return
    canvas.width = layout.backingSize.width
    canvas.height = layout.backingSize.height
    const ctx = canvas.getContext('2d')
    if (ctx) drawScene(ctx, image, layout.backingSize)
  }, [image, layout])

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!image) return
    const point = clientToImage(
      { x: event.clientX, y: event.clientY },
      event.currentTarget.getBoundingClientRect(),
      image,
    )
    onPointerMove?.(isInsideImage(point, image) ? point : null)
  }

  return (
    <div ref={containerRef} className="canvas-area">
      {image && layout ? (
        <canvas
          ref={canvasRef}
          className="image-canvas"
          style={{ width: layout.cssSize.width, height: layout.cssSize.height }}
          aria-label={`${image.fileName}, ${image.width} by ${image.height} pixels`}
          role="img"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => onPointerMove?.(null)}
        />
      ) : (
        <p className="canvas-empty">Upload a PNG or JPG to start.</p>
      )}
    </div>
  )
}
