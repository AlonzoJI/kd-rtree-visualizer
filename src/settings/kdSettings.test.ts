import { describe, expect, it } from 'vitest'
import { parseLeafCapacity } from './kdSettings'

describe('parseLeafCapacity', () => {
  it('accepts whole numbers in range, ignoring surrounding spaces', () => {
    expect(parseLeafCapacity('5')).toEqual({ ok: true, value: 5 })
    expect(parseLeafCapacity(' 12 ')).toEqual({ ok: true, value: 12 })
    expect(parseLeafCapacity('1000')).toEqual({ ok: true, value: 1000 })
  })

  it.each(['', '0', '-3', '2.5', '1e2', 'abc', '1001'])('rejects %j', (input) => {
    expect(parseLeafCapacity(input)).toEqual({ ok: false, message: 'Enter a whole number from 1 to 1000.' })
  })
})
