import type { RgbaImage } from '../detection/detectPoints'

/**
 * Reads the bitmap's pixels at native resolution. Alpha is kept as is;
 * detection composites transparent pixels onto white itself.
 */
export function readImagePixels(bitmap: ImageBitmap): RgbaImage {
  const { width, height } = bitmap
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D context is not available.')
  ctx.drawImage(bitmap, 0, 0)
  return ctx.getImageData(0, 0, width, height)
}
