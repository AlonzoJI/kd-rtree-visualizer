import { z } from 'zod'
import type { Axis } from '../trees/kdtree'

export const MAX_LEAF_CAPACITY = 1000

export interface KdSettings {
  leafCapacity: number
  startAxis: Axis
}

export const DEFAULT_KD_SETTINGS: KdSettings = { leafCapacity: 5, startAxis: 'x' }

const leafCapacitySchema = z
  .string()
  .trim()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(MAX_LEAF_CAPACITY))

export type LeafCapacityParse = { ok: true; value: number } | { ok: false; message: string }

/** Parses what the user typed into the leaf capacity field. */
export function parseLeafCapacity(input: string): LeafCapacityParse {
  const result = leafCapacitySchema.safeParse(input)
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, message: `Enter a whole number from 1 to ${MAX_LEAF_CAPACITY}.` }
}
