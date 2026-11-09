interface StepState {
  step: number
  total: number
  caption: string
}

interface CanvasToolbarProps {
  /** Whether the current view has a build to step through. */
  canStep: boolean
  stepMode: boolean
  onStepModeChange: (on: boolean) => void
  /** Current step, or null when not stepping. */
  steps: StepState | null
  onBack: () => void
  onNext: () => void
  onExport: () => void
  isExporting: boolean
}

export function CanvasToolbar({
  canStep,
  stepMode,
  onStepModeChange,
  steps,
  onBack,
  onNext,
  onExport,
  isExporting,
}: CanvasToolbarProps) {
  return (
    <div className="canvas-toolbar">
      <div className="toolbar-row">
        {canStep && (
          <button
            type="button"
            className="button button-secondary button-small"
            aria-pressed={stepMode}
            onClick={() => onStepModeChange(!stepMode)}
          >
            {stepMode ? 'Show finished tree' : 'Step through build'}
          </button>
        )}
        {canStep && steps && (
          <div className="step-nav" role="group" aria-label="Build steps">
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={onBack}
              disabled={steps.step === 0}
            >
              Back
            </button>
            <span className="step-count" aria-live="polite">
              Step {steps.step} of {steps.total}
            </span>
            <button
              type="button"
              className="button button-small"
              onClick={onNext}
              disabled={steps.step === steps.total}
            >
              Next
            </button>
          </div>
        )}
        <button
          type="button"
          className="button button-secondary button-small toolbar-export"
          onClick={onExport}
          disabled={isExporting}
        >
          {isExporting ? 'Exporting…' : 'Export PNG'}
        </button>
      </div>
      {steps && (
        <p className="step-caption" data-testid="step-caption">
          {steps.caption}
        </p>
      )}
    </div>
  )
}
