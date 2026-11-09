import { describe, expect, it } from 'vitest'
import type { Point } from '../geometry/imageSpace'
import { buildKdTree, kdInternalNodes, kdLeaves, splitIndex, type KdNode, type Region } from './kdtree'

/** Deterministic pseudo-random points with distinct coordinates, laid out like dots on an image. */
function scatteredPoints(count: number): Point[] {
  let seed = 12345
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  return Array.from({ length: count }, (_, i) => ({ x: 10 + next() * 500 + i * 1e-3, y: 20 + next() * 300 + i * 1e-3 }))
}

function sortPoints(points: Point[]): Point[] {
  return [...points].sort((a, b) => a.x - b.x || a.y - b.y)
}

function inside(point: Point, region: Region) {
  return point.x >= region.minX && point.x <= region.maxX && point.y >= region.minY && point.y <= region.maxY
}

/** Checks the invariants that hold for every tree, whatever the input. */
function expectValidTree(tree: KdNode, input: Point[]) {
  const leaves = kdLeaves(tree)
  // Every input point ends up in exactly one leaf.
  expect(sortPoints(leaves.flatMap((leaf) => leaf.points))).toEqual(sortPoints(input))
  for (const leaf of leaves) {
    for (const point of leaf.points) expect(inside(point, leaf.region)).toBe(true)
  }
  for (const node of kdInternalNodes(tree)) {
    const lowerPoints = kdLeaves(node.lower).flatMap((leaf) => leaf.points)
    const upperPoints = kdLeaves(node.upper).flatMap((leaf) => leaf.points)
    // Strict inequalities: the split line never passes through a point.
    for (const point of lowerPoints) expect(point[node.axis]).toBeLessThan(node.split)
    for (const point of upperPoints) expect(point[node.axis]).toBeGreaterThan(node.split)
    // Children split the parent region exactly at the split value.
    const max = node.axis === 'x' ? 'maxX' : 'maxY'
    const min = node.axis === 'x' ? 'minX' : 'minY'
    expect(node.lower.region).toEqual({ ...node.region, [max]: node.split })
    expect(node.upper.region).toEqual({ ...node.region, [min]: node.split })
    expect(node.lower.depth).toBe(node.depth + 1)
    expect(node.upper.depth).toBe(node.depth + 1)
  }
}

describe('buildKdTree', () => {
  it('splits 40 points with capacity 5 into 8 leaves of 5', () => {
    const points = scatteredPoints(40)
    const tree = buildKdTree(points, { leafCapacity: 5, startAxis: 'x' })

    const leaves = kdLeaves(tree)
    expect(leaves).toHaveLength(8)
    expect(leaves.map((leaf) => leaf.points.length)).toEqual([5, 5, 5, 5, 5, 5, 5, 5])
    expect(leaves.every((leaf) => leaf.depth === 3)).toBe(true)
    expectValidTree(tree, points)
  })

  it('alternates axes by depth, starting on x', () => {
    const tree = buildKdTree(scatteredPoints(40), { leafCapacity: 5, startAxis: 'x' })
    const nodes = kdInternalNodes(tree)
    expect(nodes).toHaveLength(7)
    for (const node of nodes) expect(node.axis).toBe(node.depth % 2 === 0 ? 'x' : 'y')
  })

  it('splits at the midpoint between the two middle values', () => {
    const points = scatteredPoints(40)
    const tree = buildKdTree(points, { leafCapacity: 5, startAxis: 'x' })
    const xs = points.map((point) => point.x).sort((a, b) => a - b)
    expect(tree.kind).toBe('internal')
    if (tree.kind === 'internal') expect(tree.split).toBe((xs[19] + xs[20]) / 2)
  })

  it('starts on the y axis when asked', () => {
    const points = scatteredPoints(40)
    const tree = buildKdTree(points, { leafCapacity: 5, startAxis: 'y' })

    const nodes = kdInternalNodes(tree)
    for (const node of nodes) expect(node.axis).toBe(node.depth % 2 === 0 ? 'y' : 'x')
    const ys = points.map((point) => point.y).sort((a, b) => a - b)
    expect(nodes[0].split).toBe((ys[19] + ys[20]) / 2)
    expect(kdLeaves(tree).map((leaf) => leaf.points.length)).toEqual([5, 5, 5, 5, 5, 5, 5, 5])
    expectValidTree(tree, points)
  })

  it('gives the lower side floor(n / 2) points when the count is odd', () => {
    const points = [1, 2, 3, 4, 5, 6, 7].map((x) => ({ x, y: x * 10 }))
    const tree = buildKdTree(points, { leafCapacity: 3, startAxis: 'x' })

    if (tree.kind !== 'internal') throw new Error('expected a split')
    expect(tree.split).toBe(3.5)
    expect(tree.lower).toMatchObject({ kind: 'leaf', points: [points[0], points[1], points[2]] })
    // The upper side has 4 points, over capacity, so it splits again on y.
    expect(tree.upper).toMatchObject({ kind: 'internal', axis: 'y', split: 55 })
    expectValidTree(tree, points)
  })

  it('handles an odd count of scattered points', () => {
    const points = scatteredPoints(23)
    const tree = buildKdTree(points, { leafCapacity: 4, startAxis: 'x' })
    const sizes = kdLeaves(tree).map((leaf) => leaf.points.length)
    expect(sizes.every((size) => size >= 1 && size <= 4)).toBe(true)
    expect(sizes).toEqual([2, 3, 3, 3, 3, 3, 3, 3])
    expectValidTree(tree, points)
  })

  it('moves the split off duplicate middle values so the line misses every point', () => {
    // Sorted x: 1 2 2 2 2 2 3 8. The middle pair (index 3, 4) are both 2.
    const points = [1, 2, 2, 2, 2, 2, 3, 8].map((x, i) => ({ x, y: i }))
    const tree = buildKdTree(points, { leafCapacity: 6, startAxis: 'x' })

    if (tree.kind !== 'internal') throw new Error('expected a split')
    expect(tree.axis).toBe('x')
    // Nearest change from the middle is between index 5 (x = 2) and 6 (x = 3).
    expect(tree.split).toBe(2.5)
    expect(kdLeaves(tree).map((leaf) => leaf.points.length)).toEqual([6, 2])
    expectValidTree(tree, points)
  })

  it('splits on the other axis when every point shares a coordinate', () => {
    const points = [5, 1, 4, 2, 3, 6].map((y) => ({ x: 7, y }))
    const tree = buildKdTree(points, { leafCapacity: 3, startAxis: 'x' })

    if (tree.kind !== 'internal') throw new Error('expected a split')
    expect(tree).toMatchObject({ axis: 'y', split: 3.5, depth: 0 })
    expectValidTree(tree, points)
  })

  it('keeps identical points in one leaf even above capacity', () => {
    const points = Array.from({ length: 6 }, () => ({ x: 4, y: 4 }))
    const tree = buildKdTree(points, { leafCapacity: 2, startAxis: 'x' })
    expect(tree).toMatchObject({ kind: 'leaf', depth: 0 })
    expect(kdLeaves(tree)[0].points).toHaveLength(6)
  })

  it('separates distinct points from a pile of duplicates', () => {
    const points = [...Array.from({ length: 5 }, () => ({ x: 4, y: 4 })), { x: 9, y: 1 }, { x: 1, y: 9 }]
    const tree = buildKdTree(points, { leafCapacity: 2, startAxis: 'x' })
    expectValidTree(tree, points)
    const pile = kdLeaves(tree).find((leaf) => leaf.points.length === 5)
    expect(pile).toBeDefined()
  })

  it('uses the bounds option as the root region', () => {
    const bounds = { minX: 0, minY: 0, maxX: 640, maxY: 480 }
    const tree = buildKdTree(scatteredPoints(10), { leafCapacity: 5, startAxis: 'x', bounds })
    expect(tree.region).toEqual(bounds)
    const leaves = kdLeaves(tree)
    expect(leaves[0].region).toMatchObject({ minX: 0, minY: 0, maxY: 480 })
  })

  it('returns a single leaf for few or no points', () => {
    expect(buildKdTree([], { leafCapacity: 5, startAxis: 'x' })).toMatchObject({ kind: 'leaf', points: [] })
    const three = scatteredPoints(3)
    expect(buildKdTree(three, { leafCapacity: 5, startAxis: 'x' })).toMatchObject({ kind: 'leaf', points: three })
  })

  it('does not modify the input array', () => {
    const points = scatteredPoints(40)
    const copy = structuredClone(points)
    buildKdTree(points, { leafCapacity: 5, startAxis: 'x' })
    expect(points).toEqual(copy)
  })
})

describe('splitIndex', () => {
  it('prefers the median index', () => {
    expect(splitIndex([1, 2, 3, 4])).toBe(2)
    expect(splitIndex([1, 2, 3, 4, 5])).toBe(2)
  })

  it('takes the lower index when two changes are equally close', () => {
    // Middle is 3; changes at 1 and 5 are both two away.
    expect(splitIndex([1, 2, 2, 2, 2, 3])).toBe(1)
  })

  it('returns -1 when every value is the same', () => {
    expect(splitIndex([4, 4, 4])).toBe(-1)
    expect(splitIndex([4])).toBe(-1)
  })
})
