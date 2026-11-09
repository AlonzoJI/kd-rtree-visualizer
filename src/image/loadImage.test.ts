import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadImageFile, validateImageFile } from './loadImage'

describe('validateImageFile', () => {
  it('accepts PNG and JPEG MIME types', () => {
    expect(validateImageFile({ name: 'a.png', type: 'image/png' })).toEqual({ ok: true })
    expect(validateImageFile({ name: 'a.jpg', type: 'image/jpeg' })).toEqual({ ok: true })
  })

  it('falls back to the extension when the MIME type is empty', () => {
    expect(validateImageFile({ name: 'photo.JPEG', type: '' })).toEqual({ ok: true })
    expect(validateImageFile({ name: 'notes.txt', type: '' }).ok).toBe(false)
  })

  it('rejects other image types even with a PNG name', () => {
    const result = validateImageFile({ name: 'fake.png', type: 'image/gif' })
    expect(result).toEqual({ ok: false, message: '"fake.png" is not a PNG or JPG file.' })
  })
})

describe('loadImageFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports the decoded bitmap size as the image size', async () => {
    const bitmap = { width: 640, height: 480, close: vi.fn() } as unknown as ImageBitmap
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))

    const loaded = await loadImageFile(new File(['x'], 'scan.png', { type: 'image/png' }))

    expect(loaded).toEqual({ bitmap, width: 640, height: 480, fileName: 'scan.png' })
  })

  it('turns a decode failure into a readable error', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new DOMException('bad')))

    await expect(loadImageFile(new File(['x'], 'broken.jpg', { type: 'image/jpeg' }))).rejects.toThrow(
      '"broken.jpg" could not be decoded as an image.',
    )
  })

  it('does not try to decode a rejected file', async () => {
    const decode = vi.fn()
    vi.stubGlobal('createImageBitmap', decode)

    await expect(loadImageFile(new File(['x'], 'a.gif', { type: 'image/gif' }))).rejects.toThrow('not a PNG or JPG')
    expect(decode).not.toHaveBeenCalled()
  })
})
