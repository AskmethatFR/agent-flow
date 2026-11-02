import { describe, expect, it } from 'vitest'
import { MAX_DISPLAY_LENGTH, toDisplayText } from './display-text.ts'

const range = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, index) => String.fromCodePoint(from + index))

describe('toDisplayText', () => {
  it('keeps ordinary text, spaces and non-latin letters unchanged', () => {
    const text = 'Add login \u2014 \u00e9t\u00e9 \u65e5\u672c\u8a9e \u{1f600}'
    expect(toDisplayText(text)).toBe(text)
  })

  it.each([
    ['C0 controls', range(0x00, 0x1f)],
    ['DEL and C1 controls', range(0x7f, 0x9f)],
    ['bidi marks and embeddings', ['\u061c', '\u200e', '\u200f', ...range(0x202a, 0x202e)]],
    ['bidi isolates', range(0x2066, 0x2069)],
    ['line and paragraph separators', ['\u2028', '\u2029']],
    ['zero-width space and byte order mark', ['\u200b', '\ufeff']],
    ['invisible operators', range(0x2060, 0x2064)],
    ['deprecated format characters', range(0x206a, 0x206f)],
    ['tag characters', range(0xe0000, 0xe007f)],
  ])('removes %s', (_label, chars) => {
    for (const char of chars) expect(toDisplayText(`a${char}b`)).toBe('ab')
  })

  it('keeps the characters next to the removed ranges', () => {
    const neighbours = [
      ' ', '~', '\u00a0', '\u00a1', '\u060c', '\u061b', '\u200a', '\u200c', '\u200d', '\u2027', '\u202f',
      '\u205f', '\u2065', '\u2070', '\ufefe', '\uff00', '\u{dffff}', '\u{e0080}',
    ]
    for (const char of neighbours) expect(toDisplayText(`a${char}b`)).toBe(`a${char}b`)
  })

  it('keeps text of exactly the maximum length', () => {
    const text = 'x'.repeat(MAX_DISPLAY_LENGTH)
    expect(toDisplayText(text)).toBe(text)
  })

  it('truncates longer text to the maximum length with an ellipsis', () => {
    const shown = toDisplayText('x'.repeat(MAX_DISPLAY_LENGTH + 1))
    expect(shown).toBe(`${'x'.repeat(MAX_DISPLAY_LENGTH - 1)}\u2026`)
    expect(Array.from(shown)).toHaveLength(MAX_DISPLAY_LENGTH)
  })

  it('counts code points, so it never splits a surrogate pair', () => {
    const shown = toDisplayText('\u{1f600}'.repeat(MAX_DISPLAY_LENGTH + 5))
    expect(shown).toBe(`${'\u{1f600}'.repeat(MAX_DISPLAY_LENGTH - 1)}\u2026`)
  })

  it('measures the length after removing the control characters', () => {
    const text = `${'x'.repeat(MAX_DISPLAY_LENGTH)}\u202e`
    expect(toDisplayText(text)).toBe('x'.repeat(MAX_DISPLAY_LENGTH))
  })

  it('returns an empty string for an empty or all-control input', () => {
    expect(toDisplayText('')).toBe('')
    expect(toDisplayText('\u0000\u202e')).toBe('')
  })
})
