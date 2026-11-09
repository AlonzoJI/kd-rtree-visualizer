import type { Size } from '../geometry/imageSpace'
import { drawScene, type SceneContent, type SceneImage } from '../render/drawScene'
import { drawLegend, type Legend } from '../render/legend'

/**
 * How much to enlarge overlay sizes (line widths, markers, legend text)
 * relative to their on-screen CSS size. Exports are 1 image pixel per output
 * pixel, so on big images the overlay grows to stay visible.
 */
export function exportScaleFor(image: Size): number {
  return Math.max(1, Math.max(image.width, image.height) / 1600)
}

/** `photo.jpg` in R-tree STR mode becomes `photo-rtree-str.png`. */
export function exportFileName(fileName: string, suffix: string): string {
  const base = fileName.replace(/\.[^.]+$/, '') || 'image'
  return `${base}-${suffix}.png`
}

/** Draws the image, overlay and legend onto a new canvas at the image's original resolution. */
export function renderExportCanvas(image: SceneImage, content: SceneContent, legend: Legend): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is not available.')
  const scale = exportScaleFor(image)
  // No hover state in exports.
  drawScene(ctx, image, image, scale, { ...content, hoveredIndex: -1 })
  drawLegend(ctx, legend, image, content.points, scale)
  return canvas
}

export async function downloadCanvas(canvas: HTMLCanvasElement, fileName: string): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('The browser could not encode the PNG. The image may be too large.')
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // Give the download a moment to start before releasing the data.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
