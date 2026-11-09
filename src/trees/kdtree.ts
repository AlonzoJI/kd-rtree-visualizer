import type { Point } from '../geometry/imageSpace'

export type Axis = 'x' | 'y'

/** Axis-aligned rectangle in image pixel coordinates. */
export interface Region {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface KdInternalNode {
  kind: 'internal'
  axis: Axis
  /** Points with a coordinate below this on `axis` go to `lower`, the rest to `upper`. */
  split: number
  depth: number
  region: Region
  lower: KdNode
  upper: KdNode
}

export interface KdLeaf {
  kind: 'leaf'
  depth: number
  region: Region
  points: Point[]
}

export type KdNode = KdInternalNode | KdLeaf

export interface KdTreeOptions {
  /** A node with at most this many points becomes a leaf. */
  leafCapacity: number
  /** Axis of the root split. Deeper levels alternate. */
  startAxis: Axis
  /** Region of the root node. Defaults to the bounding box of the points. */
  bounds?: Region
}

/**
 * Builds a k-d tree by splitting at the median, alternating axes by depth.
 *
 * The split value is the midpoint between the last point of the lower half and
 * the first point of the upper half, so no split line passes through a point.
 * With an odd count, the lower half gets floor(n / 2) points.
 *
 * Duplicates: when the two middle values are equal, the split moves to the
 * nearest position where neighboring sorted values differ. If every point has
 * the same coordinate on the node's axis, the node splits on the other axis
 * instead. If all its points are identical, it stays a leaf even above
 * capacity, because no line can separate them.
 *
 * The input array is not modified.
 */
export function buildKdTree(points: readonly Point[], options: KdTreeOptions): KdNode {
  const region = options.bounds ?? boundingRegion(points)
  return buildNode([...points], 0, region, options)
}

function buildNode(points: Point[], depth: number, region: Region, options: KdTreeOptions): KdNode {
  if (points.length <= options.leafCapacity) return { kind: 'leaf', depth, region, points }

  const preferred = depth % 2 === 0 ? options.startAxis : otherAxis(options.startAxis)
  for (const axis of [preferred, otherAxis(preferred)]) {
    const sorted = [...points].sort((a, b) => a[axis] - b[axis] || a[otherAxis(axis)] - b[otherAxis(axis)])
    const boundary = splitIndex(sorted.map((point) => point[axis]))
    if (boundary === -1) continue

    const split = (sorted[boundary - 1][axis] + sorted[boundary][axis]) / 2
    const [lowerRegion, upperRegion] = splitRegion(region, axis, split)
    return {
      kind: 'internal',
      axis,
      split,
      depth,
      region,
      lower: buildNode(sorted.slice(0, boundary), depth + 1, lowerRegion, options),
      upper: buildNode(sorted.slice(boundary), depth + 1, upperRegion, options),
    }
  }

  // Every point is identical, so no line can separate them.
  return { kind: 'leaf', depth, region, points }
}

/**
 * Index of the first point in the upper half, or -1 if all values are equal.
 * Prefers floor(n / 2); otherwise the nearest index where the value changes,
 * taking the lower index on a tie.
 */
export function splitIndex(sortedValues: readonly number[]): number {
  const middle = Math.floor(sortedValues.length / 2)
  for (let offset = 0; offset < sortedValues.length; offset++) {
    for (const index of [middle - offset, middle + offset]) {
      if (index >= 1 && index < sortedValues.length && sortedValues[index - 1] < sortedValues[index]) return index
    }
  }
  return -1
}

function otherAxis(axis: Axis): Axis {
  return axis === 'x' ? 'y' : 'x'
}

function splitRegion(region: Region, axis: Axis, split: number): [Region, Region] {
  return axis === 'x'
    ? [
        { ...region, maxX: split },
        { ...region, minX: split },
      ]
    : [
        { ...region, maxY: split },
        { ...region, minY: split },
      ]
}

/** Smallest region containing every point. An empty list gives a zero-size region at the origin. */
export function boundingRegion(points: readonly Point[]): Region {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const { x, y } of points) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return { minX, minY, maxX, maxY }
}

/** Leaves from lowest to highest along each split. */
export function kdLeaves(node: KdNode): KdLeaf[] {
  return node.kind === 'leaf' ? [node] : [...kdLeaves(node.lower), ...kdLeaves(node.upper)]
}

/** Internal nodes in depth-first order, parents before children. */
export function kdInternalNodes(node: KdNode): KdInternalNode[] {
  return node.kind === 'leaf' ? [] : [node, ...kdInternalNodes(node.lower), ...kdInternalNodes(node.upper)]
}

/** One split line, clipped to the region of the node that made it. */
export interface KdSplitSegment {
  depth: number
  axis: Axis
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * Every split line, deepest first, so that drawing them in order leaves the
 * top-level splits on top. Ties keep parent-before-child tree order.
 */
export function kdSplitSegments(tree: KdNode): KdSplitSegment[] {
  return segmentsOf(kdInternalNodes(tree))
}

/**
 * Split lines for the given internal nodes, deepest first. Pass
 * `kdInternalNodes(tree).slice(0, n)` to get the first n splits in build order
 * (the order the recursion makes them: a node, then its lower side, then its upper side).
 */
export function segmentsOf(nodes: readonly KdInternalNode[]): KdSplitSegment[] {
  const segments = nodes.map(({ axis, split, depth, region }) =>
    axis === 'x'
      ? { depth, axis, x1: split, y1: region.minY, x2: split, y2: region.maxY }
      : { depth, axis, x1: region.minX, y1: split, x2: region.maxX, y2: split },
  )
  return segments.sort((a, b) => b.depth - a.depth)
}

export interface KdLevelSummary {
  depth: number
  /** Axes used at this depth. Usually one; two when duplicates forced a fallback. */
  axes: Axis[]
  splits: number
}

export interface KdTreeSummary {
  /** Depth of the deepest leaf; 0 when the root is a leaf. */
  depth: number
  leafCount: number
  minLeafSize: number
  maxLeafSize: number
  meanLeafSize: number
  /** One entry per level that has at least one split, from the root down. */
  levels: KdLevelSummary[]
}

export function summarizeKdTree(tree: KdNode): KdTreeSummary {
  const leaves = kdLeaves(tree)
  const sizes = leaves.map((leaf) => leaf.points.length)
  const levels: KdLevelSummary[] = []
  for (const node of kdInternalNodes(tree)) {
    const level = (levels[node.depth] ??= { depth: node.depth, axes: [], splits: 0 })
    level.splits++
    if (!level.axes.includes(node.axis)) level.axes.push(node.axis)
  }
  for (const level of levels) level.axes.sort()
  return {
    depth: Math.max(...leaves.map((leaf) => leaf.depth)),
    leafCount: leaves.length,
    minLeafSize: Math.min(...sizes),
    maxLeafSize: Math.max(...sizes),
    meanLeafSize: sizes.reduce((sum, size) => sum + size, 0) / leaves.length,
    levels,
  }
}
