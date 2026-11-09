import { describe, expect, it } from 'vitest'
import { nearestPointIndex, togglePointAt } from './editPoints'

const points = [
  { x: 10, y: 10 },
  { x: 20, y: 10 },
]

describe('nearestPointIndex', () => {
  it('returns the closest point within range', () => {
    expect(nearestPointIndex(points, { x: 16, y: 10 }, 5)).toBe(1)
    expect(nearestPointIndex(points, { x: 13, y: 11 }, 5)).toBe(0)
  })

  it('returns -1 when nothing is in range', () => {
    expect(nearestPointIndex(points, { x: 15, y: 30 }, 5)).toBe(-1)
    expect(nearestPointIndex([], { x: 0, y: 0 }, 5)).toBe(-1)
  })
})

describe('togglePointAt', () => {
  it('removes the point that was clicked', () => {
    expect(togglePointAt(points, { x: 19, y: 11 }, 4)).toEqual([{ x: 10, y: 10 }])
  })

  it('adds a point when clicking empty space', () => {
    expect(togglePointAt(points, { x: 50.5, y: 40.25 }, 4)).toEqual([...points, { x: 50.5, y: 40.25 }])
  })

  it('does not change the input array', () => {
    const copy = structuredClone(points)
    togglePointAt(points, { x: 10, y: 10 }, 4)
    togglePointAt(points, { x: 99, y: 99 }, 4)
    expect(points).toEqual(copy)
  })
})
