import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

class ResizeObserverStub {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the header, upload button and empty canvas state', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Spatial Index Visualizer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeInTheDocument()
    expect(screen.getByText('Upload a PNG or JPG to start.')).toBeInTheDocument()
  })

  it('shows an error for a file that is not PNG or JPG', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<App />)

    await user.upload(screen.getByLabelText('Image file'), new File(['x'], 'drawing.gif', { type: 'image/gif' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('"drawing.gif" is not a PNG or JPG file.')
  })

  it('shows the native image size after a successful upload', async () => {
    const bitmap = { width: 1920, height: 1080, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    const user = userEvent.setup()
    render(<App />)

    await user.upload(screen.getByLabelText('Image file'), new File(['x'], 'map.png', { type: 'image/png' }))

    expect(await screen.findByText('1920 × 1080 px')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'map.png, 1920 by 1080 pixels' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Replace image' })).toBeInTheDocument()
  })
})
