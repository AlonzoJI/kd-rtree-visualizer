import { describe, expect, it } from 'vitest'
import type { Point } from '../geometry/imageSpace'
import {
  analyzeRTree,
  buildRTreeQuadratic,
  buildRTreeStr,
  containsRect,
  quadraticSplit,
  rectOfPoint,
  resolveRTreeOptions,
  rtreeBoxes,
  rtreeLeaves,
  rtreeNodes,
  unionRect,
  type RNode,
  type RTreeOptions,
} from './rtree'

/** Deterministic pseudo-random points, laid out like dots on an image. */
function scatteredPoints(count: number, seed = 12345): Point[] {
  let state = seed
  const next = () => (state = (state * 16807) % 2147483647) / 2147483647
  return Array.from({ length: count }, () => ({ x: Math.round(next() * 1200 * 10) / 10, y: Math.round(next() * 800 * 10) / 10 }))
}

function entryCount(node: RNode) {
  return node.kind === 'leaf' ? node.points.length : node.children.length
}

/** Checks every structural rule an R-tree must keep. */
function expectValidRTree(root: RNode, input: readonly Point[], options: RTreeOptions = {}) {
  const { maxEntries, minEntries } = resolveRTreeOptions(options)

  // Every input point lands in exactly one leaf (checked by object identity).
  const seen = new Map<Point, number>()
  for (const leaf of rtreeLeaves(root)) {
    for (const point of leaf.points) seen.set(point, (seen.get(point) ?? 0) + 1)
  }
  expect(seen.size).toBe(input.length)
  for (const point of input) expect(seen.get(point), `point ${JSON.stringify(point)}`).toBe(1)

  for (const node of rtreeNodes(root)) {
    const entries = entryCount(node)
    expect(entries, `entries at level ${node.level}`).toBeLessThanOrEqual(maxEntries)
    if (node !== root) expect(entries, `entries at level ${node.level}`).toBeGreaterThanOrEqual(minEntries)

    if (node.kind === 'leaf') {
      expect(node.level).toBe(0)
      for (const point of node.points) expect(containsRect(node.mbr, rectOfPoint(point))).toBe(true)
      if (node.points.length > 0) expect(node.mbr).toEqual(node.points.map(rectOfPoint).reduce(unionRect))
    } else {
      expect(node.children.length).toBeGreaterThanOrEqual(node === root ? 2 : minEntries)
      for (const child of node.children) {
        expect(containsRect(node.mbr, child.mbr)).toBe(true)
        // Balanced: every child is exactly one level down.
        expect(child.level).toBe(node.level - 1)
      }
      // The box is the tightest one around the children.
      expect(node.mbr).toEqual(node.children.map((child) => child.mbr).reduce(unionRect))
    }
  }
}

const builders = [
  ['STR bulk load', buildRTreeStr],
  ['quadratic insertion', buildRTreeQuadratic],
] as const

const datasets: [string, Point[]][] = [
  ['no points', []],
  ['one point', scatteredPoints(1)],
  ['exactly max points', scatteredPoints(5)],
  ['max + 1 points', scatteredPoints(6)],
  ['7 points', scatteredPoints(7)],
  ['11 points', scatteredPoints(11)],
  ['31 points (STR leaves a 1-point slice)', scatteredPoints(31)],
  ['40 points', scatteredPoints(40)],
  ['84 points', scatteredPoints(84, 99)],
  ['500 points', scatteredPoints(500, 7)],
  ['20 identical points', Array.from({ length: 20 }, () => ({ x: 50, y: 50 }))],
  ['30 points on a horizontal line', Array.from({ length: 30 }, (_, i) => ({ x: i * 3, y: 10 }))],
  ['a 7 by 7 grid', Array.from({ length: 49 }, (_, i) => ({ x: (i % 7) * 10, y: Math.floor(i / 7) * 10 }))],
  ['clusters with duplicates', [...scatteredPoints(25, 3), ...scatteredPoints(25, 3).map((p) => ({ ...p }))]],
]

const optionSets: RTreeOptions[] = [{}, { maxEntries: 4 }, { maxEntries: 8, minFill: 0.5 }, { maxEntries: 16, minFill: 0.3 }]

describe.each(builders)('%s', (_, build) => {
  describe.each(optionSets)('with options %j', (options) => {
    it.each(datasets)('keeps every invariant for %s', (_, points) => {
      expectValidRTree(build(points, options), points, options)
    })
  })

  it('does not modify the input array', () => {
    const points = scatteredPoints(40)
    const copy = structuredClone(points)
    build(points)
    expect(points).toEqual(copy)
  })

  it('returns a single leaf when the points fit in one node', () => {
    const points = scatteredPoints(5)
    const root = build(points)
    expect(root.kind).toBe('leaf')
    expect(analyzeRTree(root).height).toBe(1)
  })
})

describe('resolveRTreeOptions', () => {
  it('defaults to 5 entries with a minimum of 2', () => {
    expect(resolveRTreeOptions()).toEqual({ maxEntries: 5, minEntries: 2 })
  })

  it('rounds the minimum up', () => {
    expect(resolveRTreeOptions({ maxEntries: 4 })).toEqual({ maxEntries: 4, minEntries: 2 })
    expect(resolveRTreeOptions({ maxEntries: 9 })).toEqual({ maxEntries: 9, minEntries: 4 })
  })

  it('caps the minimum at half the maximum and keeps it at least 1', () => {
    expect(resolveRTreeOptions({ maxEntries: 5, minFill: 0.9 })).toEqual({ maxEntries: 5, minEntries: 2 })
    expect(resolveRTreeOptions({ maxEntries: 10, minFill: 0 })).toEqual({ maxEntries: 10, minEntries: 1 })
  })
})

describe('buildRTreeStr', () => {
  it('packs 40 points into 8 full leaves under 2 parents', () => {
    // The 8 leaves are packed the same way: one slice, cut into runs of 5 and 3.
    const root = buildRTreeStr(scatteredPoints(40))
    const leaves = rtreeLeaves(root)
    expect(leaves.map((leaf) => leaf.points.length)).toEqual([5, 5, 5, 5, 5, 5, 5, 5])
    expect(root.level).toBe(2)
    expect(root.kind === 'internal' && root.children.map(entryCount)).toEqual([5, 3])
  })

  it('evens out a short last run instead of leaving it underfull', () => {
    // 6 points with max 5: plain STR would make leaves of 5 and 1.
    const leaves = rtreeLeaves(buildRTreeStr(scatteredPoints(6)))
    expect(leaves.map((leaf) => leaf.points.length)).toEqual([3, 3])
  })

  it('tiles points into vertical slices first', () => {
    // A 4 by 4 grid with max 4 gives 4 leaves; STR makes 2 slices of 8, each cut by y.
    const grid = Array.from({ length: 16 }, (_, i) => ({ x: i % 4, y: Math.floor(i / 4) }))
    const boxes = rtreeLeaves(buildRTreeStr(grid, { maxEntries: 4 })).map((leaf) => leaf.mbr)
    expect(boxes).toEqual([
      { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      { minX: 0, minY: 2, maxX: 1, maxY: 3 },
      { minX: 2, minY: 0, maxX: 3, maxY: 1 },
      { minX: 2, minY: 2, maxX: 3, maxY: 3 },
    ])
  })

  it('fills nodes more fully than one-at-a-time insertion', () => {
    const points = scatteredPoints(500, 7)
    const str = analyzeRTree(buildRTreeStr(points))
    const quadratic = analyzeRTree(buildRTreeQuadratic(points))
    expect(str.averageFill).toBeGreaterThan(0.95)
    expect(str.averageFill).toBeGreaterThan(quadratic.averageFill)
    expect(str.leafCount).toBeLessThan(quadratic.leafCount)
  })
})

describe('quadraticSplit', () => {
  const rectOf = (point: Point) => rectOfPoint(point)

  it('separates two distant clusters', () => {
    const left = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: 1 },
    ]
    const right = [
      { x: 100, y: 100 },
      { x: 101, y: 102 },
      { x: 102, y: 99 },
    ]
    const [a, b] = quadraticSplit([left[0], right[0], left[1], right[1], left[2], right[2]], rectOf, 2)
    const groups = [a, b].map((group) => [...group].sort((p, q) => p.x - q.x))
    expect(groups).toContainEqual(left)
    expect(groups).toContainEqual(right)
  })

  it('seeds with the two points farthest apart in area', () => {
    const points = [
      { x: 5, y: 5 },
      { x: 0, y: 0 },
      { x: 6, y: 4 },
      { x: 10, y: 10 },
    ]
    const [a, b] = quadraticSplit(points, rectOf, 1)
    expect(a).toContain(points[1])
    expect(b).toContain(points[3])
  })

  it('gives a group all remaining entries when it needs them to reach the minimum', () => {
    // Five points near one corner and one far away: by distance alone the far
    // point would sit alone, but the minimum of 2 forces a second point to join it.
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 50, y: 50 },
    ]
    const [a, b] = quadraticSplit(points, rectOf, 2)
    expect(Math.min(a.length, b.length)).toBe(2)
    expect(a.length + b.length).toBe(6)
  })

  it('splits points on a line by length when every area is zero', () => {
    const line = Array.from({ length: 6 }, (_, i) => ({ x: i * 10, y: 0 }))
    const [a, b] = quadraticSplit(line, rectOf, 2)
    const xs = [a, b].map((group) => group.map((p) => p.x).sort((p, q) => p - q))
    // Each group is a contiguous run along the line.
    for (const group of xs) expect(group).toEqual(group.map((_, i) => group[0] + i * 10))
  })
})

describe('analyzeRTree', () => {
  it('reports leaf area, sibling overlap and fill for a hand-built tree', () => {
    const leafA = {
      kind: 'leaf' as const,
      level: 0 as const,
      mbr: { minX: 0, minY: 0, maxX: 4, maxY: 2 },
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 2 },
      ],
    }
    const leafB = {
      kind: 'leaf' as const,
      level: 0 as const,
      mbr: { minX: 3, minY: 1, maxX: 6, maxY: 5 },
      points: [
        { x: 3, y: 1 },
        { x: 6, y: 5 },
        { x: 5, y: 3 },
      ],
    }
    const root = { kind: 'internal' as const, level: 1, mbr: { minX: 0, minY: 0, maxX: 6, maxY: 5 }, children: [leafA, leafB] }

    const analysis = analyzeRTree(root, { maxEntries: 4 })

    expect(analysis).toEqual({
      height: 2,
      nodeCount: 3,
      leafCount: 2,
      totalLeafArea: 8 + 12,
      // Leaves share x 3 to 4 and y 1 to 2.
      totalOverlap: 1,
      nodes: [
        { level: 1, entries: 2, fill: 0.5, isRoot: true },
        { level: 0, entries: 2, fill: 0.5, isRoot: false },
        { level: 0, entries: 3, fill: 0.75, isRoot: false },
      ],
      averageFill: 0.625,
    })
  })

  it('counts boxes that only touch as zero overlap', () => {
    const leaf = (minX: number, maxX: number) => ({
      kind: 'leaf' as const,
      level: 0 as const,
      mbr: { minX, minY: 0, maxX, maxY: 1 },
      points: [
        { x: minX, y: 0 },
        { x: maxX, y: 1 },
      ],
    })
    const root = { kind: 'internal' as const, level: 1, mbr: { minX: 0, minY: 0, maxX: 2, maxY: 1 }, children: [leaf(0, 1), leaf(1, 2)] }
    expect(analyzeRTree(root).totalOverlap).toBe(0)
  })

  it('treats a lone root leaf as height 1 with its own fill', () => {
    const analysis = analyzeRTree(buildRTreeStr(scatteredPoints(3)))
    expect(analysis).toMatchObject({ height: 1, nodeCount: 1, leafCount: 1, averageFill: 0.6 })
  })
})

describe('rtreeBoxes', () => {
  it('lists every node box, highest level first', () => {
    const root = buildRTreeStr(scatteredPoints(40))
    const boxes = rtreeBoxes(root)
    expect(boxes).toHaveLength(rtreeNodes(root).length)
    expect(boxes.map((box) => box.level)).toEqual([2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(boxes[0].rect).toEqual(root.mbr)
  })

  it('returns nothing for an empty tree', () => {
    expect(rtreeBoxes(buildRTreeStr([]))).toEqual([])
    expect(rtreeBoxes(buildRTreeQuadratic([]))).toEqual([])
  })
})
