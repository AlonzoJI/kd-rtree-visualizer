/**
 * Image pixel coordinates are the single source of truth for everything drawn
 * on the canvas. (0, 0) is the top-left pixel of the uploaded image and
 * (width, height) is its bottom-right corner, at the image's native resolution.
 *
 * The functions here convert between that space and the two other spaces the
 * browser uses: CSS pixels (layout, pointer events) and the canvas backing
 * store (device pixels).
 */

export interface Size {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface Rect extends Size {
  left: number
  top: number
}

export interface CanvasLayout {
  /** CSS pixels per image pixel. 1 means native size; below 1 means shrunk to fit. */
  scale: number
  /** Size of the canvas element on screen, in CSS pixels. */
  cssSize: Size
  /** Size of the canvas backing store, in device pixels. */
  backingSize: Size
}

/**
 * Scale that shows the image at native size, or shrinks it just enough to fit
 * inside `available`. It never enlarges the image.
 */
export function fitScale(image: Size, available: Size): number {
  if (image.width <= 0 || image.height <= 0) return 1
  const widthRatio = Math.max(0, available.width) / image.width
  const heightRatio = Math.max(0, available.height) / image.height
  return Math.min(1, widthRatio, heightRatio)
}

/**
 * Works out how big the canvas should be on screen and in memory.
 *
 * The backing store is rounded to whole device pixels, and the CSS size is
 * derived back from that rounded value. That keeps the on-screen box an exact
 * multiple of the backing store, so a point drawn at image (x, y) lands under
 * the pointer at image (x, y) with no rounding drift.
 */
export function computeCanvasLayout(
  image: Size,
  available: Size,
  devicePixelRatio: number,
): CanvasLayout {
  const scale = fitScale(image, available)
  const pixelRatio = devicePixelRatio > 0 ? devicePixelRatio : 1
  const backingSize = {
    width: Math.max(1, Math.round(image.width * scale * pixelRatio)),
    height: Math.max(1, Math.round(image.height * scale * pixelRatio)),
  }
  return {
    scale,
    backingSize,
    cssSize: {
      width: backingSize.width / pixelRatio,
      height: backingSize.height / pixelRatio,
    },
  }
}

/**
 * The 2D context transform that lets drawing code use image pixel coordinates
 * directly. Pass the result to `ctx.setTransform(...)`.
 */
export function imageToBackingTransform(
  image: Size,
  backingSize: Size,
): [a: number, b: number, c: number, d: number, e: number, f: number] {
  return [backingSize.width / image.width, 0, 0, backingSize.height / image.height, 0, 0]
}

/**
 * Converts a pointer position (e.g. `event.clientX/Y`) to image pixel
 * coordinates, using the canvas element's current on-screen rectangle.
 * Reading the live rect means this stays correct even if CSS resizes the canvas.
 */
export function clientToImage(client: Point, canvasRect: Rect, image: Size): Point {
  return {
    x: ((client.x - canvasRect.left) * image.width) / canvasRect.width,
    y: ((client.y - canvasRect.top) * image.height) / canvasRect.height,
  }
}

/** Inverse of `clientToImage`. */
export function imageToClient(point: Point, canvasRect: Rect, image: Size): Point {
  return {
    x: canvasRect.left + (point.x * canvasRect.width) / image.width,
    y: canvasRect.top + (point.y * canvasRect.height) / image.height,
  }
}

export function isInsideImage(point: Point, image: Size): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < image.width && point.y < image.height
}
