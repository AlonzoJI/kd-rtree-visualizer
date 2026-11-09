import { useEffect, useRef, useState } from 'react'
import './App.css'
import { ImageCanvas } from './components/ImageCanvas'
import { Sidebar } from './components/Sidebar'
import { detectPoints, type DetectionResult } from './detection/detectPoints'
import type { Point } from './geometry/imageSpace'
import { loadImageFile, type LoadedImage } from './image/loadImage'
import { readImagePixels } from './image/readPixels'
import { togglePointAt } from './points/editPoints'

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
      />
      <main className="main">
        <ImageCanvas
          image={image}
          points={points}
          onPointerMove={setPointer}
          onScaleChange={setScale}
          onImageClick={(point, hitRadius) => setPoints((current) => togglePointAt(current, point, hitRadius))}
        />
      </main>
    </div>
  )
}
