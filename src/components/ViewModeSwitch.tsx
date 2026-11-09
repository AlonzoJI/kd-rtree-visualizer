import { useId } from 'react'

export type ViewMode = 'points' | 'kd' | 'rtree'

const MODES: readonly (readonly [ViewMode, string])[] = [
  ['points', 'Points'],
  ['kd', 'k-d tree'],
  ['rtree', 'R-tree'],
]

interface ViewModeSwitchProps {
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
}

export function ViewModeSwitch({ mode, onModeChange }: ViewModeSwitchProps) {
  const name = useId()
  return (
    <section className="sidebar-section">
      <h2>View</h2>
      <fieldset className="segmented">
        <legend className="visually-hidden">What to draw</legend>
        {MODES.map(([value, label]) => (
          <label key={value}>
            <input type="radio" name={name} value={value} checked={mode === value} onChange={() => onModeChange(value)} />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
    </section>
  )
}
