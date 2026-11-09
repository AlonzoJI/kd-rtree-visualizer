import { describe, expect, it } from 'vitest'
import { exportFileName, exportScaleFor } from '../export/exportPng'
import { SAMPLE_DOT_RADIUS, SAMPLE_POINTS, SAMPLE_SIZE } from '../sample/sample'
import { buildKdTree, summarizeKdTree } from '../trees/kdtree'
import { analyzeRTree, buildRTreeStr } from '../trees/rtree'
import { chooseLegendCorner, cornerPosition, kdLegend, pointsLegend, rtreeLegend } from './legend'

describe('legend content', () => {
  it('describes points only', () => {
    expect(pointsLegend(1)).toEqual({ title: 'Points', lines: [], rows: [{ swatch: { kind: 'marker' }, label: '1 point' }] })
  })

  it('lists each k-d level with its axis, plus the settings and step', () => {
    const tree = buildKdTree(SAMPLE_POINTS, { leafCapacity: 5, startAxis: 'y' })
    const legend = kdLegend({
      summary: summarizeKdTree(tree),
      leafCapacity: 5,
      startAxis: 'y',
      pointCount: 40,
      step: { step: 2, total: 7 },
    })
    expect(legend.title).toBe('k-d tree')
    expect(legend.lines).toEqual(['Leaf capacity 5, first split on y', '8 leaves, depth 3', 'Build step 2 of 7'])
    expect(legend.rows.map((row) => row.label)).toEqual([
      'Level 0: y split',
      'Level 1: x splits',
      'Level 2: y splits',
      '40 points',
    ])
    expect(legend.rows[0].swatch).toMatchObject({ kind: 'line', color: '#0d366b', width: 4 })
  })

  it('leaves out k-d levels not drawn yet when stepping', () => {
    const tree = buildKdTree(SAMPLE_POINTS, { leafCapacity: 5, startAxis: 'x' })
    const legend = kdLegend({
      summary: summarizeKdTree(tree),
      leafCapacity: 5,
      startAxis: 'x',
      pointCount: 40,
      step: { step: 2, total: 7 },
      shownDepths: new Set([0, 1]),
    })
    expect(legend.rows.map((row) => row.label)).toEqual(['Level 0: x split', 'Level 1: y splits', '40 points'])
  })

  it('lists visible R-tree levels with box counts and the stats', () => {
    const tree = buildRTreeStr(SAMPLE_POINTS)
    const legend = rtreeLegend({
      methodLabel: 'STR bulk load',
      analysis: analyzeRTree(tree),
      levels: [
        { level: 2, boxes: 1 },
        { level: 1, boxes: 2 },
        { level: 0, boxes: 8 },
      ],
      hiddenLevels: new Set([1]),
      pointCount: 40,
    })
    expect(legend.title).toBe('R-tree, STR bulk load')
    expect(legend.lines[0]).toBe('8 leaves, height 3')
    expect(legend.lines[1]).toMatch(/^Leaf area [\d,]+ px², overlap [\d,]+ px²$/)
    expect(legend.rows.map((row) => row.label)).toEqual(['Level 2 (root): 1 box', 'Level 0 (leaves): 8 boxes', '40 points'])
    expect(legend.rows[1].swatch).toMatchObject({ kind: 'line', dash: [] })
    expect(legend.rows[0].swatch).toMatchObject({ kind: 'line', dash: [7, 4] })
  })
})

describe('chooseLegendCorner', () => {
  const image = { width: 400, height: 300 }
  const panel = { width: 150, height: 80 }

  it('prefers the top right when it is empty', () => {
    expect(chooseLegendCorner([{ x: 50, y: 50 }], image, panel, 10, 5)).toBe('top-right')
  })

  it('picks the corner that covers the fewest points', () => {
    const points = [
      { x: 350, y: 40 }, // top right
      { x: 340, y: 270 }, // bottom right
      { x: 40, y: 40 }, // top left
      { x: 60, y: 60 },
    ]
    expect(chooseLegendCorner(points, image, panel, 10, 5)).toBe('bottom-left')
  })

  it('counts points whose marker would touch the panel edge', () => {
    // Just outside the top-right panel, but within the 5 px clearance.
    expect(chooseLegendCorner([{ x: 237, y: 40 }], image, panel, 10, 5)).toBe('bottom-right')
  })

  it('positions panels inside the margin', () => {
    expect(cornerPosition('bottom-right', image, panel, 10)).toEqual({ x: 240, y: 210 })
    expect(cornerPosition('top-left', image, panel, 10)).toEqual({ x: 10, y: 10 })
  })
})

describe('export helpers', () => {
  it('names the file after the image and view', () => {
    expect(exportFileName('photo.final.jpg', 'rtree-str')).toBe('photo.final-rtree-str.png')
    expect(exportFileName('.png', 'kd-tree')).toBe('image-kd-tree.png')
  })

  it('grows overlays only on large images', () => {
    expect(exportScaleFor({ width: 800, height: 500 })).toBe(1)
    expect(exportScaleFor({ width: 4800, height: 3200 })).toBe(3)
  })
})

describe('sample points', () => {
  it('fit inside the sample image', () => {
    for (const { x, y } of SAMPLE_POINTS) {
      expect(x - SAMPLE_DOT_RADIUS).toBeGreaterThan(20)
      expect(y - SAMPLE_DOT_RADIUS).toBeGreaterThan(20)
      expect(x + SAMPLE_DOT_RADIUS).toBeLessThan(SAMPLE_SIZE.width - 20)
      expect(y + SAMPLE_DOT_RADIUS).toBeLessThan(SAMPLE_SIZE.height - 20)
    }
  })

  it('are far enough apart that no two dots touch', () => {
    expect(SAMPLE_POINTS).toHaveLength(40)
    for (let i = 0; i < SAMPLE_POINTS.length; i++) {
      for (let j = i + 1; j < SAMPLE_POINTS.length; j++) {
        const a = SAMPLE_POINTS[i]
        const b = SAMPLE_POINTS[j]
        expect(Math.hypot(a.x - b.x, a.y - b.y), `points ${i} and ${j}`).toBeGreaterThan(SAMPLE_DOT_RADIUS * 2 + 4)
      }
    }
  })
})
