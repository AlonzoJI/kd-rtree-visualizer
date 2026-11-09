import type { Point } from '../geometry/imageSpace'

/**
 * Finds small dark dots in an image and returns their centers in image pixel
 * coordinates. Pixel (x, y) covers [x, x + 1) by [y, y + 1), so its center is
 * (x + 0.5, y + 0.5).
 *
 * Pipeline:
 * 1. Composite each pixel onto white and threshold its luminance into a dark mask.
 * 2. Label 8-connected dark blobs.
 * 3. Estimate the typical dot area from blobs that are round and solid.
 * 4. Ignore specks and blobs much larger than a dot (borders, big text).
 * 5. Keep dot-sized blobs that are round and solid. Letters often match a dot's
 *    area, so the shape test is what keeps text out.
 * 6. Split blobs about 2 or 3 dots in size with k-means, and keep the split
 *    only if every piece passes the same shape test.
 */

/** RGBA pixels in row-major order, 4 bytes per pixel. `ImageData` fits this shape. */
export interface RgbaImage {
  width: number
  height: number
  data: Uint8ClampedArray | Uint8Array
}

export interface DetectionOptions {
  /** A pixel is dark when its luminance after compositing onto white is below this (0 to 255). */
  darkThreshold: number
  /** Blobs smaller than this many pixels are always noise. */
  minArea: number
  /** Blobs smaller than this fraction of the typical dot area are noise. */
  noiseRatio: number
  /** Blobs up to this multiple of the typical area count as one dot. */
  singleMaxRatio: number
  /** Blobs up to this multiple are split into 2 or 3 dots; anything larger is ignored. */
  splitMaxRatio: number
  /** Minimum ellipse fill (see `shapeOf`) for a dot. Solid discs score about 1; letters score lower. */
  minEllipseFill: number
  /** Maximum ratio of a dot's long axis to its short axis. Rejects strokes and elongated letters. */
  maxAxisRatio: number
}

export const DEFAULT_DETECTION_OPTIONS: DetectionOptions = {
  darkThreshold: 128,
  minArea: 2,
  noiseRatio: 0.3,
  singleMaxRatio: 1.5,
  splitMaxRatio: 3.5,
  minEllipseFill: 0.85,
  maxAxisRatio: 1.5,
}

/** Running sums over a set of pixels, enough to get its center and shape. */
export interface Moments {
  area: number
  sumX: number
  sumY: number
  sumXX: number
  sumYY: number
  sumXY: number
}

export interface Blob extends Moments {
  label: number
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface Shape {
  /**
   * Area divided by the area of the solid ellipse with the same second
   * moments (4π·√det(covariance)). About 1 for a solid disc or ellipse; well
   * below 1 for rings, letters and other shapes with holes or spread-out strokes.
   */
  ellipseFill: number
  /** Long axis over short axis of that ellipse. 1 for a disc. */
  axisRatio: number
}

export interface DetectionStats {
  blobs: number
  singleDots: number
  splitBlobs: number
  ignoredSmall: number
  ignoredLarge: number
  ignoredShape: number
}

export interface DetectionResult {
  points: Point[]
  /** Median area of a single dot in pixels, or null when no candidate blobs were found. */
  typicalArea: number | null
  stats: DetectionStats
}

/** Luminance of an RGBA pixel after compositing it onto an opaque white background. */
export function compositedLuminance(r: number, g: number, b: number, a: number): number {
  const alpha = a / 255
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance * alpha + 255 * (1 - alpha)
}

/** 1 for dark pixels, 0 for everything else. Transparent pixels count as white. */
export function darkMask(image: RgbaImage, darkThreshold: number): Uint8Array {
  const { width, height, data } = image
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i++) {
    const o = i * 4
    mask[i] = compositedLuminance(data[o], data[o + 1], data[o + 2], data[o + 3]) < darkThreshold ? 1 : 0
  }
  return mask
}

/**
 * Labels 8-connected regions of the mask. Labels start at 1; 0 means background.
 * Uses an explicit stack so large blobs cannot overflow the call stack.
 */
export function labelComponents(
  mask: Uint8Array,
  width: number,
  height: number,
): { labels: Int32Array; blobs: Blob[] } {
  const labels = new Int32Array(width * height)
  const stack = new Int32Array(width * height)
  const blobs: Blob[] = []

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || labels[start] !== 0) continue

    const label = blobs.length + 1
    const blob: Blob = {
      label,
      area: 0,
      sumX: 0,
      sumY: 0,
      sumXX: 0,
      sumYY: 0,
      sumXY: 0,
      minX: width,
      minY: height,
      maxX: -1,
      maxY: -1,
    }
    let top = 0
    stack[top++] = start
    labels[start] = label

    while (top > 0) {
      const index = stack[--top]
      const x = index % width
      const y = (index - x) / width
      addPixel(blob, x, y)
      if (x < blob.minX) blob.minX = x
      if (x > blob.maxX) blob.maxX = x
      if (y < blob.minY) blob.minY = y
      if (y > blob.maxY) blob.maxY = y

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= width) continue
          const neighbor = ny * width + nx
          if (mask[neighbor] === 1 && labels[neighbor] === 0) {
            labels[neighbor] = label
            stack[top++] = neighbor
          }
        }
      }
    }
    blobs.push(blob)
  }

  return { labels, blobs }
}

function emptyMoments(): Moments {
  return { area: 0, sumX: 0, sumY: 0, sumXX: 0, sumYY: 0, sumXY: 0 }
}

function addPixel(moments: Moments, x: number, y: number) {
  moments.area++
  moments.sumX += x
  moments.sumY += y
  moments.sumXX += x * x
  moments.sumYY += y * y
  moments.sumXY += x * y
}

/** Center of the pixels, in image coordinates (pixel centers are at +0.5). */
function centerOf(moments: Moments): Point {
  return { x: moments.sumX / moments.area + 0.5, y: moments.sumY / moments.area + 0.5 }
}

export function shapeOf(moments: Moments): Shape {
  const { area } = moments
  const meanX = moments.sumX / area
  const meanY = moments.sumY / area
  // Each pixel is a unit square, which adds 1/12 of variance along each axis.
  // Without it a single row of pixels would have zero height.
  const varX = moments.sumXX / area - meanX * meanX + 1 / 12
  const varY = moments.sumYY / area - meanY * meanY + 1 / 12
  const covXY = moments.sumXY / area - meanX * meanY
  const determinant = varX * varY - covXY * covXY
  const halfTrace = (varX + varY) / 2
  const spread = Math.sqrt(Math.max(0, halfTrace * halfTrace - determinant))
  return {
    ellipseFill: area / (4 * Math.PI * Math.sqrt(determinant)),
    axisRatio: Math.sqrt((halfTrace + spread) / (halfTrace - spread)),
  }
}

function looksLikeDot(moments: Moments, options: DetectionOptions): boolean {
  const { ellipseFill, axisRatio } = shapeOf(moments)
  return ellipseFill >= options.minEllipseFill && axisRatio <= options.maxAxisRatio
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * Median area of the blobs that look like a single dot. Falls back to every
 * blob above `minArea` when none do.
 */
export function estimateTypicalArea(
  blobs: Blob[],
  options: Pick<DetectionOptions, 'minArea' | 'minEllipseFill' | 'maxAxisRatio'> = DEFAULT_DETECTION_OPTIONS,
): number | null {
  const candidates = blobs.filter((blob) => blob.area >= options.minArea)
  if (candidates.length === 0) return null
  const dotLike = candidates.filter((blob) => looksLikeDot(blob, { ...DEFAULT_DETECTION_OPTIONS, ...options }))
  return median((dotLike.length > 0 ? dotLike : candidates).map((blob) => blob.area))
}

export interface Clustering {
  centers: Point[]
  /** Cluster index for each input pixel. */
  assignment: Int32Array
}

/**
 * Splits points into k clusters. Seeding is deterministic: the first center
 * is the point farthest from the mean, and each next center is the point
 * farthest from all centers chosen so far.
 */
export function kMeans(xs: ArrayLike<number>, ys: ArrayLike<number>, k: number, maxIterations = 25): Clustering {
  const count = xs.length
  const assignment = new Int32Array(count)
  if (count === 0) return { centers: [], assignment }
  const clusterCount = Math.max(1, Math.min(k, count))

  const centers: Point[] = [farthestFrom(xs, ys, [meanOf(xs, ys)])]
  while (centers.length < clusterCount) centers.push(farthestFrom(xs, ys, centers))
  if (clusterCount === 1) centers[0] = meanOf(xs, ys)

  assignment.fill(-1)
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let changed = false
    for (let i = 0; i < count; i++) {
      const nearest = nearestCenter(xs[i], ys[i], centers)
      if (nearest !== assignment[i]) {
        assignment[i] = nearest
        changed = true
      }
    }
    if (!changed) break

    const sumX = new Float64Array(clusterCount)
    const sumY = new Float64Array(clusterCount)
    const sizes = new Int32Array(clusterCount)
    for (let i = 0; i < count; i++) {
      sumX[assignment[i]] += xs[i]
      sumY[assignment[i]] += ys[i]
      sizes[assignment[i]]++
    }
    for (let c = 0; c < clusterCount; c++) {
      // An empty cluster keeps its previous center.
      if (sizes[c] > 0) centers[c] = { x: sumX[c] / sizes[c], y: sumY[c] / sizes[c] }
    }
  }
  return { centers, assignment }
}

function meanOf(xs: ArrayLike<number>, ys: ArrayLike<number>): Point {
  let sumX = 0
  let sumY = 0
  for (let i = 0; i < xs.length; i++) {
    sumX += xs[i]
    sumY += ys[i]
  }
  return { x: sumX / xs.length, y: sumY / xs.length }
}

function nearestCenter(x: number, y: number, centers: Point[]): number {
  let best = 0
  let bestDistance = Infinity
  for (let c = 0; c < centers.length; c++) {
    const distance = (x - centers[c].x) ** 2 + (y - centers[c].y) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = c
    }
  }
  return best
}

function farthestFrom(xs: ArrayLike<number>, ys: ArrayLike<number>, centers: Point[]): Point {
  let best = 0
  let bestDistance = -1
  for (let i = 0; i < xs.length; i++) {
    const center = centers[nearestCenter(xs[i], ys[i], centers)]
    const distance = (xs[i] - center.x) ** 2 + (ys[i] - center.y) ** 2
    if (distance > bestDistance) {
      bestDistance = distance
      best = i
    }
  }
  return { x: xs[best], y: ys[best] }
}

/** Pixel coordinates of every pixel in each requested blob, from one pass over the labels. */
function collectPixels(labels: Int32Array, width: number, wanted: Set<number>) {
  const pixels = new Map<number, { xs: number[]; ys: number[] }>()
  for (const label of wanted) pixels.set(label, { xs: [], ys: [] })
  for (let i = 0; i < labels.length; i++) {
    const entry = pixels.get(labels[i])
    if (!entry) continue
    const x = i % width
    entry.xs.push(x)
    entry.ys.push((i - x) / width)
  }
  return pixels
}

/** Splits a blob into `k` dots, or returns null if any piece does not look like a dot. */
function splitBlob(xs: number[], ys: number[], k: number, options: DetectionOptions): Point[] | null {
  const { assignment } = kMeans(xs, ys, k)
  const pieces = Array.from({ length: k }, emptyMoments)
  for (let i = 0; i < xs.length; i++) addPixel(pieces[assignment[i]], xs[i], ys[i])
  if (pieces.some((piece) => piece.area === 0 || !looksLikeDot(piece, options))) return null
  return pieces.map(centerOf)
}

export function detectPoints(image: RgbaImage, overrides: Partial<DetectionOptions> = {}): DetectionResult {
  const options = { ...DEFAULT_DETECTION_OPTIONS, ...overrides }
  const { width, height } = image
  const { labels, blobs } = labelComponents(darkMask(image, options.darkThreshold), width, height)
  const typicalArea = estimateTypicalArea(blobs, options)
  const stats: DetectionStats = {
    blobs: blobs.length,
    singleDots: 0,
    splitBlobs: 0,
    ignoredSmall: 0,
    ignoredLarge: 0,
    ignoredShape: 0,
  }
  if (typicalArea === null) {
    stats.ignoredSmall = blobs.length
    return { points: [], typicalArea, stats }
  }

  const minArea = Math.max(options.minArea, options.noiseRatio * typicalArea)
  // Blobs that survive the size checks, in scan order, with how many dots each should hold.
  const candidates: { blob: Blob; dots: number }[] = []
  for (const blob of blobs) {
    const ratio = blob.area / typicalArea
    if (blob.area < minArea) stats.ignoredSmall++
    else if (ratio > options.splitMaxRatio) stats.ignoredLarge++
    else candidates.push({ blob, dots: ratio <= options.singleMaxRatio ? 1 : ratio < 2.5 ? 2 : 3 })
  }

  const toSplit = new Set(candidates.filter((c) => c.dots > 1).map((c) => c.blob.label))
  const pixels = toSplit.size > 0 ? collectPixels(labels, width, toSplit) : new Map()

  const points: Point[] = []
  for (const { blob, dots } of candidates) {
    if (dots === 1) {
      if (looksLikeDot(blob, options)) {
        stats.singleDots++
        points.push(centerOf(blob))
      } else {
        stats.ignoredShape++
      }
      continue
    }
    const { xs, ys } = pixels.get(blob.label)!
    const split = splitBlob(xs, ys, dots, options)
    if (split) {
      stats.splitBlobs++
      points.push(...split)
    } else {
      stats.ignoredShape++
    }
  }

  return { points, typicalArea, stats }
}
