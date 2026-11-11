import { MAX_TEXT_LENGTH } from '../contracts/contract-error'

export type MutationCounts = {
  readonly detected: number
  readonly surviving: number
}

export type ReadMutationReportResult =
  | { readonly accepted: true; readonly counts: MutationCounts }
  | { readonly accepted: false; readonly message: string }

const refusedWith = (message: string): ReadMutationReportResult => ({ accepted: false, message })

const detectedStatuses: readonly string[] = ['Killed', 'Timeout']
const survivingStatuses: readonly string[] = ['Survived', 'NoCoverage']
const uncountedStatuses: readonly string[] = ['CompileError', 'RuntimeError', 'Ignored', 'Pending']
const strykerStatuses: readonly unknown[] = [...detectedStatuses, ...survivingStatuses, ...uncountedStatuses]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isStrykerStatus = (value: unknown): value is string => strykerStatuses.includes(value)

const statusOf = (mutant: unknown): string | null =>
  isRecord(mutant) && isStrykerStatus(mutant.status) ? mutant.status : null

const mutantsOf = (file: unknown): unknown[] | null =>
  isRecord(file) && Array.isArray(file.mutants) ? file.mutants : null

const statusesOf = (document: unknown): string[] | null => {
  if (!isRecord(document) || typeof document.schemaVersion !== 'string' || !isRecord(document.files)) return null
  const mutantLists = Object.values(document.files).map(mutantsOf)
  const statuses = mutantLists.flatMap((mutants) => mutants?.map(statusOf) ?? [null])
  const known = statuses.filter((status) => status !== null)
  return known.length === statuses.length ? known : null
}

const countsOf = (statuses: readonly string[]): MutationCounts => ({
  detected: statuses.filter((status) => detectedStatuses.includes(status)).length,
  surviving: statuses.filter((status) => survivingStatuses.includes(status)).length,
})

export const readMutationReport = (text: string): ReadMutationReportResult => {
  if (text.length > MAX_TEXT_LENGTH) return refusedWith(`exceeds ${MAX_TEXT_LENGTH} characters`)
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    return refusedWith('is not valid JSON')
  }
  const statuses = statusesOf(document)
  if (statuses === null) return refusedWith('is not a Stryker mutation report')
  const counts = countsOf(statuses)
  return counts.detected + counts.surviving === 0
    ? refusedWith('has no mutant to score')
    : { accepted: true, counts }
}

export const mutationLabelOf = ({ detected, surviving }: MutationCounts): string => {
  const hundredths = Math.floor((detected * 10_000) / (detected + surviving))
  const fraction = String(hundredths % 100).padStart(2, '0')
  return `${Math.floor(hundredths / 100)}.${fraction}% mutation score, ${surviving} surviving`
}
