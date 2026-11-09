import { describe, expect, it } from 'vitest'
import type { Point } from '../geometry/imageSpace'
import { buildKdTree, kdInternalNodes, kdSplitSegments } from '../trees/kdtree'
import { buildRTreeQuadratic, buildRTreeStrTrace, rtreeBoxes, rtreeNodes } from '../trees/rtree'
import { kdFrame, kdStepCount, quadraticFrame, strFrame } from './buildSteps'

function scatteredPoints(count: number, seed = 12345): Point[] {
  let state = seed
  const next = () => (state = (state * 16807) % 2147483647) / 2147483647
  return Array.from({ length: count }, () => ({ x: Math.round(next() * 8000) / 10, y: Math.round(next() * 5000) / 10 }))
}

const bounds = { minX: 0, minY: 0, maxX: 800, maxY: 500 }

describe('kdFrame', () => {
  const tree = buildKdTree(scatteredPoints(40), { leafCapacity: 5, startAxis: 'x', bounds })

  it('starts empty and ends with the full partition', () => {
    expect(kdStepCount(tree)).toBe(7)
    expect(kdFrame(tree, 0)).toMatchObject({ step: 0, total: 7, kdSegments: [], highlight: null })
    expect(kdFrame(tree, 7).kdSegments).toEqual(kdSplitSegments(tree))
  })

  it('adds splits in recursion order: root, then the lower side before the upper side', () => {
    const nodes = kdInternalNodes(tree)
    expect(nodes.map((node) => node.depth)).toEqual([0, 1, 2, 2, 1, 2, 2])
    const third = kdFrame(tree, 3)
    expect(third.kdSegments).toHaveLength(3)
    expect(third.highlight).toEqual({ rect: nodes[2].region, level: 2 })
    expect(third.caption).toMatch(/^Split 3 of 7: x = [\d.]+ at depth 2\. 10 points divided 5 \/ 5\.$/)
  })

  it('clamps steps outside the range', () => {
    expect(kdFrame(tree, -4).step).toBe(0)
    expect(kdFrame(tree, 99).step).toBe(7)
  })

  it('explains a tree with no splits', () => {
    const leafOnly = buildKdTree(scatteredPoints(3), { leafCapacity: 5, startAxis: 'x', bounds })
    expect(kdFrame(leafOnly, 1)).toMatchObject({ step: 0, total: 0, caption: 'No splits: every point fits in one leaf.' })
  })
})

describe('strFrame', () => {
  const points = scatteredPoints(40)
  const trace = buildRTreeStrTrace(points)

  it('creates every leaf before any parent, and the root last', () => {
    expect(trace.order).toHaveLength(rtreeNodes(trace.root).length)
    expect(trace.order.map((node) => node.level)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2])
    expect(trace.order.at(-1)).toBe(trace.root)
  })

  it('reveals one node per step', () => {
    const frame = strFrame(trace, 9, points.length)
    expect(frame.rtreeBoxes).toHaveLength(9)
    expect(frame.highlight).toEqual({ rect: trace.order[8].mbr, level: 1 })
    expect(frame.caption).toBe('Node 9 of 11: a level 1 node with 5 children.')
    expect(strFrame(trace, 1, points.length).caption).toBe('Node 1 of 11: a leaf with 5 points.')
    expect(strFrame(trace, 11, points.length).caption).toBe('Node 11 of 11: the root with 2 children.')
  })

  it('ends with the same boxes as the finished tree', () => {
    // Same boxes; within a level they come in creation order rather than tree order.
    const key = (box: { level: number; rect: object }) => JSON.stringify(box)
    const last = strFrame(trace, 11, points.length).rtreeBoxes.map(key).sort()
    expect(last).toEqual(rtreeBoxes(trace.root).map(key).sort())
  })

  it('has no steps without points', () => {
    expect(strFrame(buildRTreeStrTrace([]), 3, 0)).toMatchObject({ step: 0, total: 0, rtreeBoxes: [] })
  })
})

describe('quadraticFrame', () => {
  const points = scatteredPoints(12)

  it('replays one insertion per step', () => {
    expect(quadraticFrame(points, 0)).toMatchObject({ step: 0, total: 12, rtreeBoxes: [], highlight: null })
    const third = quadraticFrame(points, 3)
    expect(third.rtreeBoxes).toEqual(rtreeBoxes(buildRTreeQuadratic(points.slice(0, 3))))
    expect(third.caption).toBe(`Point 3 of 12 inserted at (${points[2].x}, ${points[2].y}).`)
    expect(quadraticFrame(points, 12).rtreeBoxes).toEqual(rtreeBoxes(buildRTreeQuadratic(points)))
  })

  it('highlights the leaf that received the new point', () => {
    const frame = quadraticFrame(points, 4)
    const { minX, minY, maxX, maxY } = frame.highlight!.rect
    expect(points[3].x).toBeGreaterThanOrEqual(minX)
    expect(points[3].x).toBeLessThanOrEqual(maxX)
    expect(points[3].y).toBeGreaterThanOrEqual(minY)
    expect(points[3].y).toBeLessThanOrEqual(maxY)
  })

  it('says when an insertion splits the root', () => {
    // With max 5, the sixth point overflows the root leaf.
    expect(quadraticFrame(points, 6).caption).toMatch(/The root split, so the tree grew a level\.$/)
  })

  it('says when an insertion splits a leaf below the root', () => {
    const captions = points.map((_, i) => quadraticFrame(points, i + 1).caption)
    const leafSplit = captions.findIndex((caption) => caption.endsWith('Its leaf overflowed and split in two.'))
    expect(leafSplit).toBeGreaterThan(5)
  })
})
