import { useId, useRef, type ChangeEvent } from 'react'
import type { DetectionResult } from '../detection/detectPoints'
import type { Point } from '../geometry/imageSpace'
import { ACCEPTED_IMAGE_TYPES, type LoadedImage } from '../image/loadImage'

interface SidebarProps {
  image: LoadedImage | null
  scale: number | null
  pointer: Point | null
  error: string | null
  isLoading: boolean
  onFileSelected: (file: File) => void
  points: readonly Point[]
  detection: DetectionResult | null
  onResetPoints: () => void
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

function detectionSummary({ points, stats }: DetectionResult): string[] {
  const lines = [`Detected ${plural(points.length, 'dot', 'dots')}.`]
  if (stats.splitBlobs > 0) lines.push(`Split ${plural(stats.splitBlobs, 'group', 'groups')} of touching dots.`)
  const skipped = stats.ignoredLarge + stats.ignoredShape
  if (skipped > 0) lines.push(`Skipped ${plural(skipped, 'shape', 'shapes')} that did not look like dots.`)
  return lines
}

export function Sidebar({
  image,
  scale,
  pointer,
  error,
  isLoading,
  onFileSelected,
  points,
  detection,
  onResetPoints,
}: SidebarProps) {
  const isEdited = detection !== null && points !== detection.points

  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onFileSelected(file)
    // Reset so choosing the same file again still fires a change event.
    event.target.value = ''
  }

  return (
    <aside className="sidebar">
      <section className="sidebar-section">
        <h2>Image</h2>
        <label htmlFor={inputId} className="visually-hidden">
          Image file
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          className="visually-hidden"
          onChange={handleChange}
        />
        <button type="button" className="button" onClick={() => inputRef.current?.click()} disabled={isLoading}>
          {isLoading ? 'Loading…' : image ? 'Replace image' : 'Upload image'}
        </button>
        <p className="hint">PNG or JPG</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>

      {image && (
        <section className="sidebar-section">
          <h2>Points</h2>
          <p className="point-count" data-testid="point-count">
            <strong>{points.length}</strong> {points.length === 1 ? 'point' : 'points'}
          </p>
          {detection && (
            <div className="hint">
              {detectionSummary(detection).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}
          <p className="hint">Click empty space to add a point. Click a point to remove it.</p>
          {detection && (
            <button type="button" className="button button-secondary" onClick={onResetPoints} disabled={!isEdited}>
              Reset to detected points
            </button>
          )}
        </section>
      )}

      {image && (
        <section className="sidebar-section">
          <h2>Details</h2>
          <dl className="details">
            <dt>File</dt>
            <dd title={image.fileName}>{image.fileName}</dd>
            <dt>Size</dt>
            <dd>
              {image.width} × {image.height} px
            </dd>
            <dt>Shown at</dt>
            <dd>{scale === null ? '—' : `${Math.round(scale * 1000) / 10}%`}</dd>
            <dt>Pointer</dt>
            <dd data-testid="pointer">{pointer ? `${Math.floor(pointer.x)}, ${Math.floor(pointer.y)}` : '—'}</dd>
          </dl>
        </section>
      )}
    </aside>
  )
}
