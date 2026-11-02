export const MAX_DISPLAY_LENGTH = 200

const UNSAFE = /[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/g

export const toDisplayText = (text: string): string => {
  const codePoints = Array.from(text.replace(UNSAFE, ''))
  return codePoints.length > MAX_DISPLAY_LENGTH
    ? `${codePoints.slice(0, MAX_DISPLAY_LENGTH - 1).join('')}…`
    : codePoints.join('')
}
