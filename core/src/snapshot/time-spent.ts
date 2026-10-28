import type { PlanStep } from '../contracts/plan'

export type TimeSpent = {
  readonly milliseconds: number
  readonly label: string
}

const isoInstantWithOffset =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})/

const isWholeIsoInstant = (text: string): boolean =>
  text.match(isoInstantWithOffset)?.[0] === text

const finiteOrNull = (milliseconds: number): number | null =>
  Number.isFinite(milliseconds) ? milliseconds : null

export const instantOf = (text: string | null): number | null =>
  text !== null && isWholeIsoInstant(text) ? finiteOrNull(Date.parse(text)) : null

const labelOf = (milliseconds: number): string => {
  const minutes = Math.floor(milliseconds / 60_000)
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

const endOf = (step: PlanStep, now: Date): number | null =>
  step.status === 'done' ? instantOf(step.endedAt) : finiteOrNull(now.getTime())

export const timeSpentOf = (step: PlanStep, now: Date): TimeSpent | null => {
  if (step.status === 'todo') return null
  const started = instantOf(step.startedAt)
  const ended = endOf(step, now)
  if (started === null || ended === null || ended < started) return null
  const milliseconds = ended - started
  return { milliseconds, label: labelOf(milliseconds) }
}
