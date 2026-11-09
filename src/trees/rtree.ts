import type { Point } from '../geometry/imageSpace'

/**
 * R-tree over points, built either by Sort-Tile-Recursive bulk loading or by
 * inserting points one at a time with Guttman's quadratic split.
 *
 * Levels count up from the leaves: every leaf is level 0 and a parent is one
 * level above its children, so the root has the highest level and all leaves
 * sit at the same depth.
 */

/** Axis-aligned rectangle in image pixel coordinates. A single point is a zero-size rectangle. */
export interface Rect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface RLeaf {
  kind: 'leaf'
  level: 0
  /** Minimum bounding rectangle of the points. */
  mbr: Rect
  points: Point[]
}

export interface RInternalNode {
  kind: 'internal'
  level: number
  /** Minimum bounding rectangle of the children's rectangles. */
  mbr: Rect
  children: RNode[]
}

export type RNode = RLeaf | RInternalNode

export interface RTreeOptions {
  /** Most entries (points or children) a node may hold. At least 2. Default 5. */
  maxEntries?: number
  /** Fewest entries a non-root node must hold, as a fraction of `maxEntries`. Default 0.4. */
  minFill?: number
}

export interface ResolvedRTreeOptions {
  maxEntries: number
  minEntries: number
}

export const DEFAULT_MAX_ENTRIES = 5
export const DEFAULT_MIN_FILL = 0.4

/**
 * Turns options into entry counts. The minimum is ceil(minFill × max), at
 * least 1 and at most floor(max / 2): Guttman's split cannot promise more,
 * since splitting max + 1 entries into two valid nodes needs 2 × min ≤ max + 1.
 */
export function resolveRTreeOptions(options: RTreeOptions = {}): ResolvedRTreeOptions {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const minFill = options.minFill ?? DEFAULT_MIN_FILL
  const minEntries = Math.min(Math.floor(maxEntries / 2), Math.max(1, Math.ceil(minFill * maxEntries)))
  return { maxEntries, minEntries }
}

// Rectangle helpers --------------------------------------------------------

/** Placeholder rectangle for an empty tree. */
const EMPTY_RECT: Rect = { minX: 0, minY: 0, maxX: 0, maxY: 0 }

export function rectOfPoint(point: Point): Rect {
  return { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y }
}

export function unionRect(a: Rect, b: Rect): Rect {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }
}

export function rectArea(rect: Rect): number {
  return (rect.maxX - rect.minX) * (rect.maxY - rect.minY)
}

/** Half the perimeter. Used to break ties between zero-area rectangles. */
function rectMargin(rect: Rect): number {
  return rect.maxX - rect.minX + (rect.maxY - rect.minY)
}

export function intersectionArea(a: Rect, b: Rect): number {
  const width = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
  const height = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)
  return width > 0 && height > 0 ? width * height : 0
}

export function containsRect(outer: Rect, inner: Rect): boolean {
  return outer.minX <= inner.minX && outer.minY <= inner.minY && outer.maxX >= inner.maxX && outer.maxY >= inner.maxY
}

function boundingRect<T>(entries: readonly T[], rectOf: (entry: T) => Rect): Rect {
  if (entries.length === 0) return EMPTY_RECT
  return entries.map(rectOf).reduce(unionRect)
}

function center(rect: Rect): Point {
  return { x: (rect.minX + rect.maxX) / 2, y: (rect.minY + rect.maxY) / 2 }
}

function nodeRect(node: RNode): Rect {
  return node.mbr
}

function makeLeaf(points: Point[]): RLeaf {
  return { kind: 'leaf', level: 0, mbr: boundingRect(points, rectOfPoint), points }
}

function makeInternal(children: RNode[]): RInternalNode {
  return { kind: 'internal', level: children[0].level + 1, mbr: boundingRect(children, nodeRect), children }
}

/**
 * Cost of a change, compared by area first and perimeter second. Points have
 * no area, so without the second key every choice between them would tie.
 */
type Cost = readonly [area: number, margin: number]

function compareCost(a: Cost, b: Cost): number {
  return a[0] - b[0] || a[1] - b[1]
}

function enlargement(rect: Rect, added: Rect): Cost {
  const merged = unionRect(rect, added)
  return [rectArea(merged) - rectArea(rect), rectMargin(merged) - rectMargin(rect)]
}

// Sort-Tile-Recursive ------------------------------------------------------

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

/**
 * Groups items into nodes of at most `maxEntries` the STR way: sort by x, cut
 * into vertical slices of S × max items (S = ceil(sqrt(node count))), sort each
 * slice by y and cut it into runs of max.
 *
 * Plain STR can leave the last run of a slice under the minimum. Here an
 * undersized last run is evened out with the run before it, and a last slice
 * too small to form a valid node is merged into the slice before it. Every
 * other node stays full.
 */
function packStr<T>(items: readonly T[], centerOf: (item: T) => Point, { maxEntries, minEntries }: ResolvedRTreeOptions) {
  if (items.length <= maxEntries) return [[...items]]

  const nodeCount = Math.ceil(items.length / maxEntries)
  const sliceCount = Math.ceil(Math.sqrt(nodeCount))
  const byX = [...items].sort((a, b) => centerOf(a).x - centerOf(b).x || centerOf(a).y - centerOf(b).y)
  const slices = chunk(byX, sliceCount * maxEntries)
  if (slices.length > 1 && slices[slices.length - 1].length < minEntries) {
    const last = slices.pop()!
    slices[slices.length - 1].push(...last)
  }

  const groups: T[][] = []
  for (const slice of slices) {
    slice.sort((a, b) => centerOf(a).y - centerOf(b).y || centerOf(a).x - centerOf(b).x)
    const runs = chunk(slice, maxEntries)
    const last = runs[runs.length - 1]
    if (runs.length > 1 && last.length < minEntries) {
      // Both halves get at least floor((max + 1) / 2) >= min entries.
      const merged = [...runs[runs.length - 2], ...last]
      const half = Math.ceil(merged.length / 2)
      runs.splice(runs.length - 2, 2, merged.slice(0, half), merged.slice(half))
    }
    groups.push(...runs)
  }
  return groups
}

/** Builds an R-tree in one pass with Sort-Tile-Recursive packing. The input array is not modified. */
export function buildRTreeStr(points: readonly Point[], options: RTreeOptions = {}): RNode {
  const resolved = resolveRTreeOptions(options)
  let level: RNode[] = packStr(points, (point) => point, resolved).map(makeLeaf)
  while (level.length > 1) {
    level = packStr(level, (node) => center(node.mbr), resolved).map(makeInternal)
  }
  return level[0]
}

// Guttman insertion with quadratic split -----------------------------------

/**
 * Guttman's quadratic split. Seeds are the pair that would waste the most
 * area together; then, repeatedly, the entry with the strongest preference
 * for one group joins the group it enlarges least. When a group needs every
 * remaining entry to reach `minEntries`, it gets them all.
 *
 * Ties (common with zero-area points) fall back to perimeter, then the
 * smaller group, then the first group.
 */
export function quadraticSplit<T>(entries: readonly T[], rectOf: (entry: T) => Rect, minEntries: number): [T[], T[]] {
  const rects = entries.map(rectOf)

  let seedA = 0
  let seedB = 1
  let worstWaste: Cost = [-Infinity, -Infinity]
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const merged = unionRect(rects[i], rects[j])
      const waste: Cost = [
        rectArea(merged) - rectArea(rects[i]) - rectArea(rects[j]),
        rectMargin(merged) - rectMargin(rects[i]) - rectMargin(rects[j]),
      ]
      if (compareCost(waste, worstWaste) > 0) {
        worstWaste = waste
        seedA = i
        seedB = j
      }
    }
  }

  const groups: [number[], number[]] = [[seedA], [seedB]]
  const groupRects: [Rect, Rect] = [rects[seedA], rects[seedB]]
  const remaining = new Set(entries.keys())
  remaining.delete(seedA)
  remaining.delete(seedB)

  while (remaining.size > 0) {
    const short = groups.findIndex((group) => group.length + remaining.size <= minEntries)
    if (short !== -1) {
      for (const index of remaining) {
        groups[short].push(index)
        groupRects[short] = unionRect(groupRects[short], rects[index])
      }
      break
    }

    // PickNext: the entry with the biggest difference in enlargement between groups.
    let next = -1
    let bestPreference: Cost = [-Infinity, -Infinity]
    for (const index of remaining) {
      const [areaA, marginA] = enlargement(groupRects[0], rects[index])
      const [areaB, marginB] = enlargement(groupRects[1], rects[index])
      const preference: Cost = [Math.abs(areaA - areaB), Math.abs(marginA - marginB)]
      if (compareCost(preference, bestPreference) > 0) {
        bestPreference = preference
        next = index
      }
    }

    const target =
      compareCost(enlargement(groupRects[0], rects[next]), enlargement(groupRects[1], rects[next])) ||
      compareCost([rectArea(groupRects[0]), rectMargin(groupRects[0])], [rectArea(groupRects[1]), rectMargin(groupRects[1])]) ||
      groups[0].length - groups[1].length
    const chosen = target <= 0 ? 0 : 1
    groups[chosen].push(next)
    groupRects[chosen] = unionRect(groupRects[chosen], rects[next])
    remaining.delete(next)
  }

  return [groups[0].map((index) => entries[index]), groups[1].map((index) => entries[index])]
}

/** ChooseLeaf step: the child needing the least enlargement, then the smallest, then the emptiest. */
function chooseSubtree(children: readonly RNode[], added: Rect): RNode {
  let best = children[0]
  for (const child of children.slice(1)) {
    const order =
      compareCost(enlargement(child.mbr, added), enlargement(best.mbr, added)) ||
      compareCost([rectArea(child.mbr), rectMargin(child.mbr)], [rectArea(best.mbr), rectMargin(best.mbr)]) ||
      entryCount(child) - entryCount(best)
    if (order < 0) best = child
  }
  return best
}

function entryCount(node: RNode): number {
  return node.kind === 'leaf' ? node.points.length : node.children.length
}

/** Splits an overfull node in place and returns its new sibling. */
function splitNode(node: RNode, minEntries: number): RNode {
  if (node.kind === 'leaf') {
    const [kept, moved] = quadraticSplit(node.points, rectOfPoint, minEntries)
    node.points = kept
    node.mbr = boundingRect(kept, rectOfPoint)
    return makeLeaf(moved)
  }
  const [kept, moved] = quadraticSplit(node.children, nodeRect, minEntries)
  node.children = kept
  node.mbr = boundingRect(kept, nodeRect)
  return makeInternal(moved)
}

/**
 * Inserts one point (Guttman's Insert with quadratic split) and returns the
 * root, which is new when the old root split. Mutates the tree.
 */
export function insertPoint(root: RNode, point: Point, options: RTreeOptions = {}): RNode {
  const { maxEntries, minEntries } = resolveRTreeOptions(options)
  const added = rectOfPoint(point)

  const path: RInternalNode[] = []
  let node = root
  while (node.kind === 'internal') {
    path.push(node)
    node = chooseSubtree(node.children, added)
  }
  node.points.push(point)
  node.mbr = boundingRect(node.points, rectOfPoint)
  let sibling = node.points.length > maxEntries ? splitNode(node, minEntries) : null

  // AdjustTree: walk back up, adding split siblings and tightening rectangles.
  for (let i = path.length - 1; i >= 0; i--) {
    const parent = path[i]
    if (sibling) parent.children.push(sibling)
    sibling = parent.children.length > maxEntries ? splitNode(parent, minEntries) : null
    parent.mbr = boundingRect(parent.children, nodeRect)
  }

  return sibling ? makeInternal([root, sibling]) : root
}

/** Builds an R-tree by inserting the points in order. The input array is not modified. */
export function buildRTreeQuadratic(points: readonly Point[], options: RTreeOptions = {}): RNode {
  let root: RNode = makeLeaf([])
  for (const point of points) root = insertPoint(root, point, options)
  return root
}

// Traversal and analysis ---------------------------------------------------

/** Every node, parents before children. */
export function rtreeNodes(root: RNode): RNode[] {
  return root.kind === 'leaf' ? [root] : [root, ...root.children.flatMap(rtreeNodes)]
}

export function rtreeLeaves(root: RNode): RLeaf[] {
  return rtreeNodes(root).filter((node): node is RLeaf => node.kind === 'leaf')
}

export interface RNodeFill {
  level: number
  entries: number
  /** Entries divided by max entries, from 0 to 1. */
  fill: number
  isRoot: boolean
}

export interface RTreeAnalysis {
  /** Number of levels; 1 when the root is a leaf. */
  height: number
  nodeCount: number
  leafCount: number
  /** Sum of the areas of all leaf rectangles. */
  totalLeafArea: number
  /**
   * Sum of the intersection areas of every pair of sibling rectangles, over
   * all internal nodes. Space shared by three siblings counts once per pair.
   */
  totalOverlap: number
  /** One entry per node, parents before children. */
  nodes: RNodeFill[]
  /** Mean fill of the non-root nodes, or of the root when it is the only node. */
  averageFill: number
}

export function analyzeRTree(root: RNode, options: RTreeOptions = {}): RTreeAnalysis {
  const { maxEntries } = resolveRTreeOptions(options)
  const nodes = rtreeNodes(root)
  const leaves = nodes.filter((node): node is RLeaf => node.kind === 'leaf')

  let totalOverlap = 0
  for (const node of nodes) {
    if (node.kind === 'leaf') continue
    for (let i = 0; i < node.children.length; i++) {
      for (let j = i + 1; j < node.children.length; j++) {
        totalOverlap += intersectionArea(node.children[i].mbr, node.children[j].mbr)
      }
    }
  }

  const fills = nodes.map((node) => ({
    level: node.level,
    entries: entryCount(node),
    fill: entryCount(node) / maxEntries,
    isRoot: node === root,
  }))
  const counted = fills.length > 1 ? fills.filter((fill) => !fill.isRoot) : fills

  return {
    height: root.level + 1,
    nodeCount: nodes.length,
    leafCount: leaves.length,
    totalLeafArea: leaves.reduce((sum, leaf) => sum + rectArea(leaf.mbr), 0),
    totalOverlap,
    nodes: fills,
    averageFill: counted.reduce((sum, fill) => sum + fill.fill, 0) / counted.length,
  }
}
