import type { Point } from '../geometry/imageSpace'

/** Index of the point closest to `target` within `maxDistance`, or -1 if none is that close. */
export function nearestPointIndex(points: readonly Point[], target: Point, maxDistance: number): number {
  let best = -1
  let bestDistance = maxDistance * maxDistance
  points.forEach((point, index) => {
    const distance = (point.x - target.x) ** 2 + (point.y - target.y) ** 2
    if (distance <= bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  return best
}

/**
 * A click on or near an existing point removes it; a click on empty space
 * adds a point there. `hitRadius` is in image pixels.
 */
export function togglePointAt(points: readonly Point[], target: Point, hitRadius: number): Point[] {
  const hit = nearestPointIndex(points, target, hitRadius)
  if (hit === -1) return [...points, { x: target.x, y: target.y }]
  return points.filter((_, index) => index !== hit)
}
