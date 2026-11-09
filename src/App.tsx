import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { ImageCanvas } from './components/ImageCanvas'
import { KdTreePanel } from './components/KdTreePanel'
import { RTreePanel, type RTreeLevelInfo, type RTreeMethod } from './components/RTreePanel'
import { ViewModeSwitch, type ViewMode } from './components/ViewModeSwitch'
import { Sidebar } from './components/Sidebar'
import { detectPoints, type DetectionResult } from './detection/detectPoints'
import type { Point } from './geometry/imageSpace'
import { loadImageFile, type LoadedImage } from './image/loadImage'
import { readImagePixels } from './image/readPixels'
import { togglePointAt } from './points/editPoints'
import { DEFAULT_KD_SETTINGS, parseLeafCapacity } from './settings/kdSettings'
import { buildKdTree, kdSplitSegments, summarizeKdTree, type Axis, type KdSplitSegment } from './trees/kdtree'
import { analyzeRTree, buildRTreeQuadratic, buildRTreeStr, rtreeBoxes, type RTreeBox } from './trees/rtree'

const NO_SEGMENTS: readonly KdSplitSegment[] = []
const NO_BOXES: readonly RTreeBox[] = []

const DETECTION_FAILED = 'Could not scan this image for dots. You can still add points by clicking the image.'

function runDetection(image: LoadedImage): DetectionResult | null {
  try {
    return detectPoints(readImagePixels(image.bitmap))
  } catch {
    return null
  }
}

export default function App() {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [scale, setScale] = useState<number | null>(null)
  const [pointer, setPointer] = useState<Point | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [detection, setDetection] = useState<DetectionResult | null>(null)
  /** The working list of points, in image pixel coordinates. Starts as the detected points. */
  const [points, setPoints] = useState<Point[]>([])
  const latestRequest = useRef(0)

  const [viewMode, setViewMode] = useState<ViewMode>('points')
  const [capacityInput, setCapacityInput] = useState(String(DEFAULT_KD_SETTINGS.leafCapacity))
  /** Last valid capacity; an invalid entry keeps drawing the previous tree. */
  const [leafCapacity, setLeafCapacity] = useState(DEFAULT_KD_SETTINGS.leafCapacity)
  const [startAxis, setStartAxis] = useState<Axis>(DEFAULT_KD_SETTINGS.startAxis)
  const capacityParse = parseLeafCapacity(capacityInput)

  // Rebuilt whenever the points, settings or image change, so the canvas redraws on its own.
  const kdTree = useMemo(
    () =>
      viewMode === 'kd' && image
        ? buildKdTree(points, {
            leafCapacity,
            startAxis,
            bounds: { minX: 0, minY: 0, maxX: image.width, maxY: image.height },
          })
        : null,
    [viewMode, image, points, leafCapacity, startAxis],
  )
  const kdSegments = useMemo(() => (kdTree ? kdSplitSegments(kdTree) : NO_SEGMENTS), [kdTree])
  const kdSummary = useMemo(() => (kdTree ? summarizeKdTree(kdTree) : null), [kdTree])

  const [rtreeMethod, setRtreeMethod] = useState<RTreeMethod>('str')
  const [hiddenLevels, setHiddenLevels] = useState<ReadonlySet<number>>(new Set())

  // Both methods are built over the same points so the sidebar can compare them.
  const rtrees = useMemo(
    () => (viewMode === 'rtree' && image ? { str: buildRTreeStr(points), quadratic: buildRTreeQuadratic(points) } : null),
    [viewMode, image, points],
  )
  const rtreeAnalyses = useMemo(
    () => (rtrees ? { str: analyzeRTree(rtrees.str), quadratic: analyzeRTree(rtrees.quadratic) } : null),
    [rtrees],
  )
  const allRtreeBoxes = useMemo(() => (rtrees ? rtreeBoxes(rtrees[rtreeMethod]) : NO_BOXES), [rtrees, rtreeMethod])
  const visibleRtreeBoxes = useMemo(
    () => allRtreeBoxes.filter((box) => !hiddenLevels.has(box.level)),
    [allRtreeBoxes, hiddenLevels],
  )
  const rtreeLevels = useMemo(() => {
    const counts = new Map<number, number>()
    for (const box of allRtreeBoxes) counts.set(box.level, (counts.get(box.level) ?? 0) + 1)
    return [...counts].map(([level, boxes]): RTreeLevelInfo => ({ level, boxes }))
  }, [allRtreeBoxes])

  function toggleLevel(level: number) {
    setHiddenLevels((current) => {
      const next = new Set(current)
      if (!next.delete(level)) next.add(level)
      return next
    })
  }

  const overlayLabel = kdSummary
    ? `k-d tree with ${kdSummary.leafCount} leaves`
    : rtreeAnalyses
      ? `R-tree with ${rtreeAnalyses[rtreeMethod].leafCount} leaves`
      : undefined

  function handleCapacityInput(value: string) {
    setCapacityInput(value)
    const parsed = parseLeafCapacity(value)
    if (parsed.ok) setLeafCapacity(parsed.value)
  }

  // Free the decoded pixels when an image is replaced or the app unmounts.
  useEffect(() => () => image?.bitmap.close(), [image])

  async function handleFileSelected(file: File) {
    const request = ++latestRequest.current
    setError(null)
    setIsLoading(true)
    try {
      const loaded = await loadImageFile(file)
      if (request !== latestRequest.current) {
        loaded.bitmap.close()
        return
      }
      const result = runDetection(loaded)
      setImage(loaded)
      setDetection(result)
      setPoints(result?.points ?? [])
      setPointer(null)
      if (!result) setError(DETECTION_FAILED)
    } catch (loadError) {
      if (request === latestRequest.current) {
        setError(loadError instanceof Error ? loadError.message : 'The image could not be loaded.')
      }
    } finally {
      if (request === latestRequest.current) setIsLoading(false)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Spatial Index Visualizer</h1>
        <p>k-d tree and R-tree</p>
      </header>
      <Sidebar
        image={image}
        scale={scale}
        pointer={pointer}
        error={error}
        isLoading={isLoading}
        onFileSelected={handleFileSelected}
        points={points}
        detection={detection}
        onResetPoints={() => setPoints(detection?.points ?? [])}
      >
        <ViewModeSwitch mode={viewMode} onModeChange={setViewMode} />
        {viewMode === 'kd' && (
          <KdTreePanel
            capacityInput={capacityInput}
            capacityError={capacityParse.ok ? null : capacityParse.message}
            leafCapacity={leafCapacity}
            onCapacityInputChange={handleCapacityInput}
            startAxis={startAxis}
            onStartAxisChange={setStartAxis}
            summary={kdSummary}
          />
        )}
        {viewMode === 'rtree' && rtreeAnalyses && (
          <RTreePanel
            method={rtreeMethod}
            onMethodChange={setRtreeMethod}
            analyses={rtreeAnalyses}
            levels={rtreeLevels}
            hiddenLevels={hiddenLevels}
            onToggleLevel={toggleLevel}
          />
        )}
      </Sidebar>
      <main className="main">
        <ImageCanvas
          image={image}
          points={points}
          kdSegments={kdSegments}
          rtreeBoxes={visibleRtreeBoxes}
          overlayLabel={overlayLabel}
          onPointerMove={setPointer}
          onScaleChange={setScale}
          onImageClick={(point, hitRadius) => setPoints((current) => togglePointAt(current, point, hitRadius))}
        />
      </main>
    </div>
  )
}
