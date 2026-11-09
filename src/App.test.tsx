import { render, screen, within } from '@testing-library/react'
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

/** 100 by 40 white image with 8 black 4 by 4 squares in a row. */
function eightDotImage() {
  const width = 100
  const height = 40
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (let dot = 0; dot < 8; dot++) {
    const left = 4 + dot * 12
    const top = 10 + (dot % 3) * 8
    for (let y = top; y < top + 4; y++) {
      for (let x = left; x < left + 4; x++) data.set([0, 0, 0, 255], (y * width + x) * 4)
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

  it('builds a k-d tree from the points and updates it when settings change', async () => {
    vi.mocked(readImagePixels).mockReturnValue(twoDotImage())
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 40, height: 20, close: vi.fn() }))
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByLabelText('Image file'), new File(['x'], 'dots.png', { type: 'image/png' }))
    await screen.findByTestId('point-count')

    await user.click(screen.getByRole('radio', { name: 'k-d tree' }))
    // Default capacity 5 holds both points in one leaf.
    const summary = () => within(screen.getByTestId('kd-summary'))
    expect(summary().getByText('Leaves').nextSibling).toHaveTextContent('1')
    expect(screen.getByText('No splits yet. Add more points than the leaf capacity.')).toBeInTheDocument()

    const capacity = screen.getByLabelText('Leaf capacity')
    await user.clear(capacity)
    await user.type(capacity, '1')
    expect(summary().getByText('Depth').nextSibling).toHaveTextContent('1')
    expect(summary().getByText('Leaves').nextSibling).toHaveTextContent('2')
    expect(summary().getByText('Points per leaf').nextSibling).toHaveTextContent('1')
    const legend = screen.getByRole('list', { name: 'Split levels' })
    expect(within(legend).getByText('x · 1 split')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /k-d tree with 2 leaves/ })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'y' }))
    expect(within(legend).getByText('y · 1 split')).toBeInTheDocument()

    // An invalid entry shows an error and keeps the last valid tree.
    await user.type(capacity, 'a')
    expect(screen.getByText('Enter a whole number from 1 to 1000.')).toBeInTheDocument()
    expect(capacity).toHaveAttribute('aria-invalid', 'true')
    expect(summary().getByText('Leaves').nextSibling).toHaveTextContent('2')

    await user.click(screen.getByRole('radio', { name: 'Points' }))
    expect(screen.queryByTestId('kd-summary')).not.toBeInTheDocument()
  })

  it('shows R-tree stats for both build methods and toggles levels', async () => {
    vi.mocked(readImagePixels).mockReturnValue(eightDotImage())
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 100, height: 40, close: vi.fn() }))
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByLabelText('Image file'), new File(['x'], 'dots.png', { type: 'image/png' }))
    expect(await screen.findByTestId('point-count')).toHaveTextContent('8 points')

    await user.click(screen.getByRole('radio', { name: 'R-tree' }))

    const stats = within(screen.getByTestId('rtree-stats'))
    expect(stats.getByRole('columnheader', { name: 'STR' })).toHaveClass('is-selected')
    // 8 points with max 5: STR makes 2 leaves of 4 under a root, so height 2.
    const strCell = (row: string) => stats.getByRole('rowheader', { name: row }).nextElementSibling
    expect(strCell('Height')).toHaveTextContent('2')
    expect(strCell('Leaves')).toHaveTextContent('2')
    expect(strCell('Average fill')).toHaveTextContent('80%')
    expect(screen.getByRole('img', { name: /R-tree with 2 leaves/ })).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Build method'), 'Quadratic insertion')
    expect(stats.getByRole('columnheader', { name: 'Quadratic' })).toHaveClass('is-selected')
    expect(stats.getByRole('columnheader', { name: 'STR' })).not.toHaveClass('is-selected')

    const levels = within(screen.getByRole('list', { name: 'R-tree levels' }))
    const leaves = levels.getByRole('checkbox', { name: /Level 0 \(leaves\)/ })
    expect(leaves).toBeChecked()
    await user.click(leaves)
    expect(leaves).not.toBeChecked()
    expect(levels.getByRole('checkbox', { name: /Level 1 \(root\)/ })).toBeChecked()
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
