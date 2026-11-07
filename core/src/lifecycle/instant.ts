export const instantTime = (value: unknown): number => {
  if (typeof value !== 'string') return Number.NaN
  const milliseconds = Date.parse(value)
  if (Number.isNaN(milliseconds)) return Number.NaN
  const canonical = new Date(milliseconds).toISOString()
  const isInstant = value === canonical || value === canonical.replace('.000Z', 'Z')
  return isInstant ? milliseconds : Number.NaN
}
