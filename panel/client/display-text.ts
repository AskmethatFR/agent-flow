export const MAX_DISPLAY_LENGTH = 200

const UNSAFE =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200b\u200e\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\u206a-\u206f\ufeff\u{e0000}-\u{e007f}]/gu

export const toDisplayText = (text: string): string => {
  const codePoints = Array.from(text.replace(UNSAFE, ''))
  return codePoints.length > MAX_DISPLAY_LENGTH
    ? `${codePoints.slice(0, MAX_DISPLAY_LENGTH - 1).join('')}\u2026`
    : codePoints.join('')
}
