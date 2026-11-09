import { z } from 'zod'

export const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg'

const imageMimeType = z.enum(['image/png', 'image/jpeg'])
const imageFileName = z.string().regex(/\.(png|jpe?g)$/i)

/** A decoded image plus its native pixel size, which defines image space. */
export interface LoadedImage {
  bitmap: ImageBitmap
  width: number
  height: number
  fileName: string
}

export type ImageValidation = { ok: true } | { ok: false; message: string }

/**
 * Accepts PNG and JPEG files. Some systems report an empty MIME type, so a
 * .png/.jpg/.jpeg extension is accepted when the type is missing.
 */
export function validateImageFile(file: Pick<File, 'name' | 'type'>): ImageValidation {
  const hasAcceptedType = imageMimeType.safeParse(file.type).success
  const hasAcceptedName = file.type === '' && imageFileName.safeParse(file.name).success
  if (hasAcceptedType || hasAcceptedName) return { ok: true }
  return { ok: false, message: `"${file.name}" is not a PNG or JPG file.` }
}

export async function loadImageFile(file: File): Promise<LoadedImage> {
  const validation = validateImageFile(file)
  if (!validation.ok) throw new Error(validation.message)

  let bitmap: ImageBitmap
  try {
    // Decodes at native resolution and applies EXIF orientation, so the
    // bitmap's width and height are exactly the pixels we draw.
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(`"${file.name}" could not be decoded as an image.`)
  }

  return { bitmap, width: bitmap.width, height: bitmap.height, fileName: file.name }
}
