import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { readImagePixels } from './image/readPixels'

vi.mock('./image/readPixels', () => ({ readImagePixels: vi.fn() }))

/** 40 by 20 white image with two 5 by 5 black squares. */
function twoDotImage() {
  const width = 40
  const height = 20
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (const [left, top] of [
    [5, 5],
    [25, 8],
  ]) {
    for (let y = top; y < top + 5; y++) {
      for (let x = left; x < left + 5; x++) data.set([0, 0, 0, 255], (y * width + x) * 4)
    }
  }
  return { width, height, data }
}

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
    expect(screen.getByRole('img', { name: /^map\.png, 1920 by 1080 pixels/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Replace image' })).toBeInTheDocument()
  })

  it('detects dots on upload and shows the point count', async () => {
    vi.mocked(readImagePixels).mockReturnValue(twoDotImage())
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 40, height: 20, close: vi.fn() }))
    const user = userEvent.setup()
    render(<App />)

    await user.upload(screen.getByLabelText('Image file'), new File(['x'], 'dots.png', { type: 'image/png' }))

    expect(await screen.findByTestId('point-count')).toHaveTextContent('2 points')
    expect(screen.getByText('Detected 2 dots.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset to detected points' })).toBeDisabled()
  })

  it('still shows the image when detection fails', async () => {
    vi.mocked(readImagePixels).mockImplementation(() => {
      throw new Error('no canvas')
    })
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 40, height: 20, close: vi.fn() }))
    const user = userEvent.setup()
    render(<App />)

    await user.upload(screen.getByLabelText('Image file'), new File(['x'], 'dots.png', { type: 'image/png' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not scan this image for dots.')
    expect(screen.getByTestId('point-count')).toHaveTextContent('0 points')
  })
})
