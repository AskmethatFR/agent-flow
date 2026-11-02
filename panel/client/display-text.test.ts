import { describe, expect, it } from 'vitest'
import { MAX_DISPLAY_LENGTH, toDisplayText } from './display-text.ts'

const range = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, index) => String.fromCharCode(from + index))

describe('toDisplayText', () => {
  it('keeps ordinary text, spaces and non-latin letters unchanged', () => {
    expect(toDisplayText('Add login — été 日本語 😀')).toBe('Add login — été 日本語 😀')
  })

  it.each([
    ['C0 controls', range(0x00, 0x1f)],
    ['DEL and C1 controls', range(0x7f, 0x9f)],
    ['bidi marks and embeddings', ['؜', '‎', '‏', ...range(0x202a, 0x202e)]],
    ['bidi isolates', range(0x2066, 0x2069)],
  ])('removes %s', (_label, chars) => {
    for (const char of chars) expect(toDisplayText(`a${char}b`)).toBe('ab')
  })

  it('keeps the characters next to the removed ranges', () => {
    for (const char of [' ', '~', ' ', '¡', '‍', ' ', ' ', '⁥', '⁪']) {
      expect(toDisplayText(`a${char}b`)).toBe(`a${char}b`)
    }
  })

  it('keeps text of exactly the maximum length', () => {
    const text = 'x'.repeat(MAX_DISPLAY_LENGTH)
    expect(toDisplayText(text)).toBe(text)
  })

  it('truncates longer text to the maximum length with an ellipsis', () => {
    const shown = toDisplayText('x'.repeat(MAX_DISPLAY_LENGTH + 1))
    expect(shown).toBe(`${'x'.repeat(MAX_DISPLAY_LENGTH - 1)}…`)
    expect(Array.from(shown)).toHaveLength(MAX_DISPLAY_LENGTH)
  })

  it('counts code points, so it never splits a surrogate pair', () => {
    const shown = toDisplayText('😀'.repeat(MAX_DISPLAY_LENGTH + 5))
    expect(shown).toBe(`${'😀'.repeat(MAX_DISPLAY_LENGTH - 1)}…`)
  })

  it('measures the length after removing the control characters', () => {
    const text = `${'x'.repeat(MAX_DISPLAY_LENGTH)}‮`
    expect(toDisplayText(text)).toBe('x'.repeat(MAX_DISPLAY_LENGTH))
  })

  it('returns an empty string for an empty or all-control input', () => {
    expect(toDisplayText('')).toBe('')
    expect(toDisplayText('\u0000‮')).toBe('')
  })
})
