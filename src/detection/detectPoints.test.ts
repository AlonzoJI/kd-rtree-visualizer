import { describe, expect, it } from 'vitest'
import type { Point } from '../geometry/imageSpace'
import {
  compositedLuminance,
  darkMask,
  detectPoints,
  estimateTypicalArea,
  kMeans,
  labelComponents,
  shapeOf,
  type RgbaImage,
} from './detectPoints'

type Rgba = [number, number, number, number]
const WHITE: Rgba = [255, 255, 255, 255]
const BLACK: Rgba = [0, 0, 0, 255]
const TRANSPARENT: Rgba = [0, 0, 0, 0]

function makeImage(width: number, height: number, background: Rgba = WHITE): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(background, i * 4)
  return { width, height, data }
}

function setPixel(image: RgbaImage, x: number, y: number, color: Rgba = BLACK) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return
  image.data.set(color, (y * image.width + x) * 4)
}

/** Fills every pixel whose center lies within `radius` of (cx, cy). */
function fillDisc(image: RgbaImage, cx: number, cy: number, radius: number, color: Rgba = BLACK) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radius * radius) setPixel(image, x, y, color)
    }
  }
}

function fillRect(image: RgbaImage, x0: number, y0: number, width: number, height: number) {
  for (let y = y0; y < y0 + height; y++) for (let x = x0; x < x0 + width; x++) setPixel(image, x, y)
}

/** Sorts by y then x so tests do not depend on scan order. */
function sorted(points: Point[]): Point[] {
  return [...points].sort((a, b) => a.y - b.y || a.x - b.x)
}

function expectPointsNear(actual: Point[], expected: Point[], tolerance: number) {
  expect(actual).toHaveLength(expected.length)
  const a = sorted(actual)
  const e = sorted(expected)
  e.forEach((point, i) => {
    expect(Math.abs(a[i].x - point.x), `x of point ${i}`).toBeLessThanOrEqual(tolerance)
    expect(Math.abs(a[i].y - point.y), `y of point ${i}`).toBeLessThanOrEqual(tolerance)
  })
}

const SINGLE_DOTS: Point[] = [
  { x: 10, y: 10 },
  { x: 40, y: 12 },
  { x: 70, y: 10 },
  { x: 12, y: 50 },
  { x: 72, y: 52 },
]

function imageWithSingleDots(background: Rgba = WHITE) {
  const image = makeImage(90, 70, background)
  for (const dot of SINGLE_DOTS) fillDisc(image, dot.x, dot.y, 3)
  return image
}

describe('compositedLuminance', () => {
  it('treats fully transparent pixels as white whatever their color', () => {
    expect(compositedLuminance(0, 0, 0, 0)).toBe(255)
  })

  it('keeps opaque colors as they are', () => {
    expect(compositedLuminance(0, 0, 0, 255)).toBe(0)
    expect(compositedLuminance(255, 255, 255, 255)).toBeCloseTo(255)
  })

  it('blends half-transparent black halfway to white', () => {
    expect(compositedLuminance(0, 0, 0, 127.5)).toBeCloseTo(127.5)
  })
})

describe('darkMask', () => {
  it('marks only dark pixels', () => {
    const image = makeImage(3, 1)
    setPixel(image, 0, 0, BLACK)
    setPixel(image, 1, 0, [200, 200, 200, 255])
    setPixel(image, 2, 0, [0, 0, 0, 40]) // mostly transparent black reads as light grey
    expect(Array.from(darkMask(image, 128))).toEqual([1, 0, 0])
  })
})

describe('labelComponents', () => {
  it('joins diagonal neighbors (8-connectivity) and separates gaps', () => {
    // 1 0 0 1
    // 0 1 0 1
    const mask = Uint8Array.from([1, 0, 0, 1, 0, 1, 0, 1])
    const { labels, blobs } = labelComponents(mask, 4, 2)
    expect(blobs.map((blob) => blob.area)).toEqual([2, 2])
    expect(Array.from(labels)).toEqual([1, 0, 0, 2, 0, 1, 0, 2])
    expect(blobs[1]).toMatchObject({ minX: 3, maxX: 3, minY: 0, maxY: 1 })
  })
})

describe('estimateTypicalArea', () => {
  it('uses the median of round blobs and ignores a long bar', () => {
    const image = imageWithSingleDots()
    fillRect(image, 0, 66, 90, 2)
    const { blobs } = labelComponents(darkMask(image, 128), image.width, image.height)
    const discArea = blobs[0].area
    expect(estimateTypicalArea(blobs)).toBe(discArea)
  })

  it('returns null when there are no blobs', () => {
    expect(estimateTypicalArea([])).toBeNull()
  })
})

describe('kMeans', () => {
  it('finds the centers of two separate clouds', () => {
    const xs = [0, 1, 0, 1, 10, 11, 10, 11]
    const ys = [0, 0, 1, 1, 5, 5, 6, 6]
    expectPointsNear(kMeans(xs, ys, 2).centers, [{ x: 0.5, y: 0.5 }, { x: 10.5, y: 5.5 }], 1e-9)
  })

  it('returns the same answer every time', () => {
    const xs = [3, 1, 4, 1, 5, 9, 2, 6]
    const ys = [2, 7, 1, 8, 2, 8, 1, 8]
    expect(kMeans(xs, ys, 3)).toEqual(kMeans(xs, ys, 3))
  })

  it('assigns each point to a cluster', () => {
    const { assignment } = kMeans([0, 1, 10, 11], [0, 0, 0, 0], 2)
    expect(assignment[0]).toBe(assignment[1])
    expect(assignment[2]).toBe(assignment[3])
    expect(assignment[0]).not.toBe(assignment[2])
  })
})

function blobOf(image: RgbaImage) {
  const { blobs } = labelComponents(darkMask(image, 128), image.width, image.height)
  expect(blobs).toHaveLength(1)
  return blobs[0]
}

/** A ring about the area of a 3 px dot, like the letter "o". */
function fillRing(image: RgbaImage, cx: number, cy: number) {
  for (let y = cy - 6; y <= cy + 6; y++) {
    for (let x = cx - 6; x <= cx + 6; x++) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (distance <= 4.5 && distance > 3.3) setPixel(image, x, y)
    }
  }
}

describe('shapeOf', () => {
  it('scores a solid disc as round and full', () => {
    const image = makeImage(20, 20)
    fillDisc(image, 10, 10, 4)
    const shape = shapeOf(blobOf(image))
    expect(shape.ellipseFill).toBeGreaterThan(0.95)
    expect(shape.axisRatio).toBeLessThan(1.05)
  })

  it('scores a ring low on fill', () => {
    const image = makeImage(20, 20)
    fillRing(image, 10, 10)
    expect(shapeOf(blobOf(image)).ellipseFill).toBeLessThan(0.6)
  })

  it('scores a stroke as elongated', () => {
    const image = makeImage(30, 5)
    fillRect(image, 2, 2, 20, 2)
    expect(shapeOf(blobOf(image)).axisRatio).toBeGreaterThan(5)
  })
})

describe('detectPoints', () => {
  it('finds the center of each isolated dot', () => {
    const result = detectPoints(imageWithSingleDots())
    expectPointsNear(result.points, SINGLE_DOTS, 1e-9)
    expect(result.stats.singleDots).toBe(5)
  })

  it('composites transparent pixels onto white before thresholding', () => {
    // Background is transparent black: without compositing the whole image would be one dark blob.
    const result = detectPoints(imageWithSingleDots(TRANSPARENT))
    expectPointsNear(result.points, SINGLE_DOTS, 1e-9)
  })

  it('returns nothing for a blank image', () => {
    const result = detectPoints(makeImage(20, 20))
    expect(result.points).toEqual([])
    expect(result.typicalArea).toBeNull()
  })

  it('ignores borders and blocks much larger than a dot', () => {
    const image = imageWithSingleDots()
    // One-pixel frame around the whole image, plus a text-sized block.
    fillRect(image, 0, 0, 90, 1)
    fillRect(image, 0, 69, 90, 1)
    fillRect(image, 0, 0, 1, 70)
    fillRect(image, 89, 0, 1, 70)
    fillRect(image, 30, 30, 24, 10)

    const result = detectPoints(image)

    expectPointsNear(result.points, SINGLE_DOTS, 1e-9)
    expect(result.stats.ignoredLarge).toBe(2)
  })

  it('ignores specks of noise', () => {
    const image = imageWithSingleDots()
    setPixel(image, 50, 40)
    setPixel(image, 51, 40)
    const result = detectPoints(image)
    expectPointsNear(result.points, SINGLE_DOTS, 1e-9)
    expect(result.stats.ignoredSmall).toBe(1)
  })

  it('ignores thin strokes whose area is in the dot range', () => {
    const image = imageWithSingleDots()
    fillRect(image, 25, 30, 40, 1) // about 1.4 dots of area, but one pixel thick
    const result = detectPoints(image)
    expectPointsNear(result.points, SINGLE_DOTS, 1e-9)
    expect(result.stats.ignoredShape).toBe(1)
  })

  it('ignores letter-like shapes that are about the size of a dot', () => {
    const image = imageWithSingleDots()
    fillRing(image, 30, 32) // "o"
    fillRect(image, 50, 28, 2, 8) // "L"
    fillRect(image, 50, 34, 6, 2)
    fillRect(image, 60, 28, 6, 2) // "C"
    fillRect(image, 60, 28, 2, 8)
    fillRect(image, 60, 34, 6, 2)

    const result = detectPoints(image)

    expectPointsNear(result.points, SINGLE_DOTS, 1e-9)
    expect(result.stats.ignoredShape).toBe(3)
  })

  it('splits two touching dots into two points', () => {
    const image = imageWithSingleDots()
    fillDisc(image, 38, 35, 3)
    fillDisc(image, 44, 35, 3)

    const result = detectPoints(image)

    expectPointsNear(result.points, [...SINGLE_DOTS, { x: 38, y: 35 }, { x: 44, y: 35 }], 0.5)
    expect(result.stats.splitBlobs).toBe(1)
  })

  it('splits three touching dots into three points', () => {
    const image = imageWithSingleDots()
    const cluster = [
      { x: 38, y: 33 },
      { x: 44, y: 33 },
      { x: 41, y: 38 },
    ]
    for (const dot of cluster) fillDisc(image, dot.x, dot.y, 3)

    const result = detectPoints(image)

    expectPointsNear(result.points, [...SINGLE_DOTS, ...cluster], 0.75)
    expect(result.stats.splitBlobs).toBe(1)
  })
})
