import type { Point } from '../geometry/imageSpace'
import type { LoadedImage } from '../image/loadImage'

export const SAMPLE_FILE_NAME = 'sample-points.png'
export const SAMPLE_SIZE = { width: 800, height: 500 } as const
export const SAMPLE_DOT_RADIUS = 5

/**
 * 40 hand-placed dots: a dense cluster at the top left, a band across the
 * middle, a tight group at the bottom right and a scatter elsewhere. The mix
 * makes the k-d tree and the two R-tree builds look clearly different.
 */
export const SAMPLE_POINTS: readonly Point[] = [
  // Dense cluster, top left.
  { x: 110, y: 100 },
  { x: 140, y: 95 },
  { x: 175, y: 110 },
  { x: 120, y: 135 },
  { x: 155, y: 130 },
  { x: 190, y: 140 },
  { x: 105, y: 170 },
  { x: 140, y: 165 },
  { x: 175, y: 175 },
  { x: 130, y: 200 },
  { x: 165, y: 205 },
  { x: 200, y: 190 },
  // Band across the middle.
  { x: 300, y: 290 },
  { x: 345, y: 310 },
  { x: 390, y: 295 },
  { x: 435, y: 315 },
  { x: 480, y: 300 },
  { x: 525, y: 285 },
  { x: 570, y: 310 },
  { x: 615, y: 295 },
  { x: 660, y: 315 },
  { x: 700, y: 300 },
  // Scatter.
  { x: 420, y: 80 },
  { x: 560, y: 120 },
  { x: 690, y: 70 },
  { x: 740, y: 190 },
  { x: 330, y: 180 },
  { x: 480, y: 190 },
  { x: 80, y: 330 },
  { x: 200, y: 400 },
  { x: 260, y: 460 },
  { x: 380, y: 420 },
  { x: 60, y: 460 },
  { x: 520, y: 440 },
  // Tight group, bottom right.
  { x: 650, y: 410 },
  { x: 675, y: 400 },
  { x: 700, y: 415 },
  { x: 660, y: 440 },
  { x: 690, y: 445 },
  { x: 715, y: 440 },
]

/**
 * Draws the sample dots onto a white image, so the sample goes through the
 * same detection pipeline as an upload.
 */
export async function createSampleImage(): Promise<LoadedImage> {
  const { width, height } = SAMPLE_SIZE
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is not available.')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  // A light frame and caption; both are too light to count as dots.
  ctx.strokeStyle = '#d4d4d0'
  ctx.lineWidth = 2
  ctx.strokeRect(20, 20, width - 40, height - 40)
  ctx.fillStyle = '#a3a39c'
  ctx.font = '14px system-ui, sans-serif'
  ctx.fillText('Built-in sample, 40 points', 32, 44)

  ctx.fillStyle = '#000000'
  for (const { x, y } of SAMPLE_POINTS) {
    ctx.beginPath()
    ctx.arc(x, y, SAMPLE_DOT_RADIUS, 0, Math.PI * 2)
    ctx.fill()
  }

  const bitmap = await createImageBitmap(canvas)
  return { bitmap, width, height, fileName: SAMPLE_FILE_NAME }
}
