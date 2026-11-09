import { describe, expect, it } from 'vitest'
import {
  clientToImage,
  computeCanvasLayout,
  fitScale,
  imageToBackingTransform,
  imageToClient,
  isInsideImage,
} from './imageSpace'

describe('fitScale', () => {
  it('keeps native size when the image already fits', () => {
    expect(fitScale({ width: 400, height: 300 }, { width: 800, height: 600 })).toBe(1)
  })

  it('never enlarges a small image', () => {
    expect(fitScale({ width: 10, height: 10 }, { width: 1000, height: 1000 })).toBe(1)
  })

  it('shrinks by the tighter of the two dimensions', () => {
    expect(fitScale({ width: 2000, height: 1000 }, { width: 1000, height: 1000 })).toBe(0.5)
    expect(fitScale({ width: 1000, height: 4000 }, { width: 1000, height: 1000 })).toBe(0.25)
  })

  it('returns 0 instead of a negative scale when there is no room', () => {
    expect(fitScale({ width: 100, height: 100 }, { width: -5, height: 50 })).toBe(0)
  })
})

describe('computeCanvasLayout', () => {
  it('sizes the backing store in device pixels', () => {
    const layout = computeCanvasLayout({ width: 400, height: 300 }, { width: 800, height: 600 }, 2)
    expect(layout.scale).toBe(1)
    expect(layout.cssSize).toEqual({ width: 400, height: 300 })
    expect(layout.backingSize).toEqual({ width: 800, height: 600 })
  })

  it('derives the CSS size from the rounded backing size', () => {
    // 1001 * 0.5 = 500.5 CSS px; at DPR 1 that rounds to 501 device px.
    const layout = computeCanvasLayout({ width: 1001, height: 1001 }, { width: 500.5, height: 500.5 }, 1)
    expect(layout.backingSize).toEqual({ width: 501, height: 501 })
    expect(layout.cssSize).toEqual({ width: 501, height: 501 })
  })

  it('falls back to a pixel ratio of 1 when given a bad value', () => {
    const layout = computeCanvasLayout({ width: 100, height: 50 }, { width: 500, height: 500 }, 0)
    expect(layout.backingSize).toEqual({ width: 100, height: 50 })
  })
})

describe('imageToBackingTransform', () => {
  it('maps the full image onto the full backing store', () => {
    const [a, b, c, d, e, f] = imageToBackingTransform({ width: 2000, height: 1000 }, { width: 1000, height: 500 })
    expect([a, b, c, d, e, f]).toEqual([0.5, 0, 0, 0.5, 0, 0])
    // The image's bottom-right corner lands on the backing store's bottom-right corner.
    expect(2000 * a + e).toBe(1000)
    expect(1000 * d + f).toBe(500)
  })
})

describe('clientToImage', () => {
  const image = { width: 2000, height: 1000 }
  // Canvas shown at half size, offset by the sidebar and header.
  const rect = { left: 280, top: 56, width: 1000, height: 500 }

  it('maps the canvas corners to the image corners', () => {
    expect(clientToImage({ x: 280, y: 56 }, rect, image)).toEqual({ x: 0, y: 0 })
    expect(clientToImage({ x: 1280, y: 556 }, rect, image)).toEqual({ x: 2000, y: 1000 })
  })

  it('scales an interior point by the display scale', () => {
    expect(clientToImage({ x: 380, y: 106 }, rect, image)).toEqual({ x: 200, y: 100 })
  })

  it('round-trips with imageToClient', () => {
    const point = { x: 1234.5, y: 678.25 }
    const back = clientToImage(imageToClient(point, rect, image), rect, image)
    expect(back.x).toBeCloseTo(point.x, 10)
    expect(back.y).toBeCloseTo(point.y, 10)
  })
})

describe('isInsideImage', () => {
  const image = { width: 10, height: 5 }

  it('includes the top-left edge and excludes the bottom-right edge', () => {
    expect(isInsideImage({ x: 0, y: 0 }, image)).toBe(true)
    expect(isInsideImage({ x: 9.99, y: 4.99 }, image)).toBe(true)
    expect(isInsideImage({ x: 10, y: 2 }, image)).toBe(false)
    expect(isInsideImage({ x: 2, y: -0.1 }, image)).toBe(false)
  })
})
