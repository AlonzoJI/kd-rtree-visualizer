import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { CanvasToolbar } from './components/CanvasToolbar'
import { ImageCanvas } from './components/ImageCanvas'
import { KdTreePanel } from './components/KdTreePanel'
import { RTreePanel, type RTreeLevelInfo, type RTreeMethod } from './components/RTreePanel'
import { ViewModeSwitch, type ViewMode } from './components/ViewModeSwitch'
import { Sidebar } from './components/Sidebar'
import { detectPoints, type DetectionResult } from './detection/detectPoints'
import { downloadCanvas, exportFileName, renderExportCanvas } from './export/exportPng'
import type { Point } from './geometry/imageSpace'
import { loadImageFile, type LoadedImage } from './image/loadImage'
import { readImagePixels } from './image/readPixels'
import { togglePointAt } from './points/editPoints'
import { kdHighlight, rtreeHighlight } from './render/drawScene'
import { kdLegend, pointsLegend, rtreeLegend, type Legend } from './render/legend'
import { createSampleImage } from './sample/sample'
import { DEFAULT_KD_SETTINGS, parseLeafCapacity } from './settings/kdSettings'
import { buildKdTree, kdSplitSegments, summarizeKdTree, type Axis, type KdSplitSegment } from './trees/kdtree'
import { analyzeRTree, buildRTreeQuadratic, buildRTreeStrTrace, rtreeBoxes, type RTreeBox } from './trees/rtree'
import { kdFrame, quadraticFrame, strFrame } from './steps/buildSteps'

const NO_SEGMENTS: readonly KdSplitSegment[] = []
const NO_BOXES: readonly RTreeBox[] = []

/** Box count per level, highest level first (boxes arrive sorted that way). */
function countLevels(boxes: readonly RTreeBox[]): RTreeLevelInfo[] {
  const counts = new Map<number, number>()
  for (const box of boxes) counts.set(box.level, (counts.get(box.level) ?? 0) + 1)
  return [...counts].map(([level, count]) => ({ level, boxes: count }))
}

const METHOD_LABELS: Record<RTreeMethod, string> = { str: 'STR bulk load', quadratic: 'quadratic insertion' }

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
  const rtrees = useMemo(() => {
    if (viewMode !== 'rtree' || !image) return null
    const strTrace = buildRTreeStrTrace(points)
    return { strTrace, str: strTrace.root, quadratic: buildRTreeQuadratic(points) }
  }, [viewMode, image, points])
  const rtreeAnalyses = useMemo(
    () => (rtrees ? { str: analyzeRTree(rtrees.str), quadratic: analyzeRTree(rtrees.quadratic) } : null),
    [rtrees],
  )
  const allRtreeBoxes = useMemo(() => (rtrees ? rtreeBoxes(rtrees[rtreeMethod]) : NO_BOXES), [rtrees, rtreeMethod])
  const rtreeLevels = useMemo(() => countLevels(allRtreeBoxes), [allRtreeBoxes])

  function toggleLevel(level: number) {
    setHiddenLevels((current) => {
      const next = new Set(current)
      if (!next.delete(level)) next.add(level)
      return next
    })
  }

  // Step-through: reveal the build one split, node or insertion at a time.
  const [stepMode, setStepMode] = useState(false)
  const [step, setStep] = useState(0)
  const frame = useMemo(() => {
    if (!stepMode) return null
    if (viewMode === 'kd' && kdTree) return kdFrame(kdTree, step)
    if (viewMode === 'rtree' && rtrees) {
      return rtreeMethod === 'str' ? strFrame(rtrees.strTrace, step, points.length) : quadraticFrame(points, step)
    }
    return null
  }, [stepMode, viewMode, kdTree, rtrees, rtreeMethod, points, step])

  const drawnKdSegments = frame ? frame.kdSegments : kdSegments
  const drawnRtreeBoxes = useMemo(
    () => (frame ? frame.rtreeBoxes : allRtreeBoxes).filter((box) => !hiddenLevels.has(box.level)),
    [frame, allRtreeBoxes, hiddenLevels],
  )
  const highlight = useMemo(() => {
    if (!frame?.highlight) return null
    const { rect, level } = frame.highlight
    return viewMode === 'kd' ? kdHighlight(rect) : rtreeHighlight(rect, level)
  }, [frame, viewMode])

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode)
    setStep(0)
  }

  function changeRtreeMethod(method: RTreeMethod) {
    setRtreeMethod(method)
    setStep(0)
  }

  function changeStepMode(on: boolean) {
    setStepMode(on)
    setStep(0)
  }

  const [isExporting, setIsExporting] = useState(false)

  function currentLegend(): Legend {
    const stepInfo = frame ? { step: frame.step, total: frame.total } : null
    if (viewMode === 'kd' && kdSummary) {
      return kdLegend({
        summary: kdSummary,
        leafCapacity,
        startAxis,
        pointCount: points.length,
        step: stepInfo,
        shownDepths: frame ? new Set(frame.kdSegments.map((segment) => segment.depth)) : undefined,
      })
    }
    if (viewMode === 'rtree' && rtreeAnalyses) {
      return rtreeLegend({
        methodLabel: METHOD_LABELS[rtreeMethod],
        analysis: rtreeAnalyses[rtreeMethod],
        // When stepping, describe only the boxes built so far.
        levels: frame ? countLevels(frame.rtreeBoxes) : rtreeLevels,
        hiddenLevels,
        pointCount: points.length,
        step: stepInfo,
      })
    }
    return pointsLegend(points.length)
  }

  async function handleExport() {
    if (!image) return
    setIsExporting(true)
    setError(null)
    try {
      const canvas = renderExportCanvas(
        image,
        { points, kdSegments: drawnKdSegments, rtreeBoxes: drawnRtreeBoxes, highlight },
        currentLegend(),
      )
      const view = viewMode === 'kd' ? 'kd-tree' : viewMode === 'rtree' ? `rtree-${rtreeMethod}` : 'points'
      await downloadCanvas(canvas, exportFileName(image.fileName, frame ? `${view}-step-${frame.step}` : view))
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'The PNG could not be exported.')
    } finally {
      setIsExporting(false)
    }
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

  /** Loads an image from any source, runs detection and replaces the current points. */
  async function loadImage(load: () => Promise<LoadedImage>) {
    const request = ++latestRequest.current
    setError(null)
    setIsLoading(true)
    try {
      const loaded = await load()
      if (request !== latestRequest.current) {
        loaded.bitmap.close()
        return
      }
      const result = runDetection(loaded)
      setImage(loaded)
      setDetection(result)
      setPoints(result?.points ?? [])
      setPointer(null)
      setStep(0)
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
        onFileSelected={(file) => loadImage(() => loadImageFile(file))}
        onLoadSample={() => loadImage(createSampleImage)}
        points={points}
        detection={detection}
        onResetPoints={() => setPoints(detection?.points ?? [])}
      >
        <ViewModeSwitch mode={viewMode} onModeChange={changeViewMode} />
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
            onMethodChange={changeRtreeMethod}
            analyses={rtreeAnalyses}
            levels={rtreeLevels}
            hiddenLevels={hiddenLevels}
            onToggleLevel={toggleLevel}
          />
        )}
      </Sidebar>
      <main className="main">
        {image && (
          <CanvasToolbar
            canStep={viewMode !== 'points'}
            stepMode={stepMode}
            onStepModeChange={changeStepMode}
            steps={frame}
            onBack={() => frame && setStep(frame.step - 1)}
            onNext={() => frame && setStep(frame.step + 1)}
            onExport={handleExport}
            isExporting={isExporting}
          />
        )}
        <ImageCanvas
          image={image}
          points={points}
          kdSegments={drawnKdSegments}
          rtreeBoxes={drawnRtreeBoxes}
          highlight={highlight}
          overlayLabel={overlayLabel}
          emptyMessage="Upload a PNG or JPG, or load the sample, to start."
          onPointerMove={setPointer}
          onScaleChange={setScale}
          onImageClick={(point, hitRadius) => setPoints((current) => togglePointAt(current, point, hitRadius))}
        />
      </main>
    </div>
  )
}
