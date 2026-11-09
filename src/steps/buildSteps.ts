import type { Point } from '../geometry/imageSpace'
import { kdInternalNodes, kdLeaves, segmentsOf, type KdNode, type KdSplitSegment, type Region } from '../trees/kdtree'
import {
  analyzeRTree,
  boxesOf,
  buildRTreeQuadratic,
  rtreeBoxes,
  rtreeLeaves,
  type RTreeBox,
  type RTreeOptions,
  type StrBuildTrace,
} from '../trees/rtree'

/**
 * What to draw at one step of a build. Step 0 is the empty start; step
 * `total` shows the finished partition.
 */
export interface StepFrame {
  step: number
  total: number
  kdSegments: KdSplitSegment[]
  rtreeBoxes: RTreeBox[]
  /** The part that the latest step added or changed, to shade on the canvas. */
  highlight: { rect: Region; level: number } | null
  caption: string
}

function clampStep(step: number, total: number) {
  return Math.max(0, Math.min(total, Math.floor(step)))
}

function formatNumber(value: number) {
  return String(Math.round(value * 10) / 10)
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}

export function kdStepCount(tree: KdNode): number {
  return kdInternalNodes(tree).length
}

/** k-d tree after the first `step` splits, in the order the recursion made them. */
export function kdFrame(tree: KdNode, step: number): StepFrame {
  const nodes = kdInternalNodes(tree)
  const current = clampStep(step, nodes.length)
  const node = nodes[current - 1]
  let caption = nodes.length === 0 ? 'No splits: every point fits in one leaf.' : 'Start. Press Next to make the first split.'
  if (node) {
    const lower = kdLeaves(node.lower).reduce((sum, leaf) => sum + leaf.points.length, 0)
    const upper = kdLeaves(node.upper).reduce((sum, leaf) => sum + leaf.points.length, 0)
    caption =
      `Split ${current} of ${nodes.length}: ${node.axis} = ${formatNumber(node.split)} at depth ${node.depth}. ` +
      `${plural(lower + upper, 'point')} divided ${lower} / ${upper}.`
  }
  return {
    step: current,
    total: nodes.length,
    kdSegments: segmentsOf(nodes.slice(0, current)),
    rtreeBoxes: [],
    highlight: node ? { rect: node.region, level: node.depth } : null,
    caption,
  }
}

/** STR R-tree after the first `step` nodes were created: leaves first, then each level up. */
export function strFrame(trace: StrBuildTrace, step: number, pointCount: number): StepFrame {
  const total = pointCount === 0 ? 0 : trace.order.length
  const current = clampStep(step, total)
  const node = trace.order[current - 1]
  let caption = total === 0 ? 'No points to pack.' : 'Start. STR packs leaves first, then each level above.'
  if (node) {
    const contents =
      node.kind === 'leaf' ? plural(node.points.length, 'point') : plural(node.children.length, 'child', 'children')
    const role = node === trace.root ? 'the root' : node.kind === 'leaf' ? 'a leaf' : `a level ${node.level} node`
    caption = `Node ${current} of ${total}: ${role} with ${contents}.`
  }
  return {
    step: current,
    total,
    kdSegments: [],
    rtreeBoxes: boxesOf(trace.order.slice(0, current)),
    highlight: node ? { rect: node.mbr, level: node.level } : null,
    caption,
  }
}

/**
 * Quadratic-split R-tree after the first `step` points were inserted. Points
 * go in one at a time, so a step is one insertion; replaying a prefix gives
 * exactly the tree the full build had at that moment.
 */
export function quadraticFrame(points: readonly Point[], step: number, options: RTreeOptions = {}): StepFrame {
  const total = points.length
  const current = clampStep(step, total)
  if (current === 0) {
    return {
      step: 0,
      total,
      kdSegments: [],
      rtreeBoxes: [],
      highlight: null,
      caption: total === 0 ? 'No points to insert.' : 'Start. Points are inserted one at a time.',
    }
  }

  const tree = buildRTreeQuadratic(points.slice(0, current), options)
  const before = analyzeRTree(buildRTreeQuadratic(points.slice(0, current - 1), options), options)
  const after = analyzeRTree(tree, options)
  const inserted = points[current - 1]
  const leaf = rtreeLeaves(tree).find((candidate) => candidate.points.includes(inserted))!

  let caption = `Point ${current} of ${total} inserted at (${formatNumber(inserted.x)}, ${formatNumber(inserted.y)}).`
  if (after.height > before.height) caption += ' The root split, so the tree grew a level.'
  else if (after.nodeCount > before.nodeCount) caption += ' Its leaf overflowed and split in two.'

  return {
    step: current,
    total,
    kdSegments: [],
    rtreeBoxes: rtreeBoxes(tree),
    highlight: { rect: leaf.mbr, level: 0 },
    caption,
  }
}
