import { useEffect, useRef, useState } from 'react'
import './App.css'
import { ImageCanvas } from './components/ImageCanvas'
import { Sidebar } from './components/Sidebar'
import type { Point } from './geometry/imageSpace'
import { loadImageFile, type LoadedImage } from './image/loadImage'

export default function App() {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [scale, setScale] = useState<number | null>(null)
  const [pointer, setPointer] = useState<Point | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
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
      setImage(loaded)
      setPointer(null)
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
      />
      <main className="main">
        <ImageCanvas image={image} onPointerMove={setPointer} onScaleChange={setScale} />
      </main>
    </div>
  )
}
