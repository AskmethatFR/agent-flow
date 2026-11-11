import { MAX_TEXT_LENGTH } from '../contracts/contract-error'

export type ParsedTestReport = {
  readonly source: 'vitest' | 'cucumber-js'
  readonly passed: number
  readonly total: number
  readonly failedSuites: number
}

export type ReadTestReportResult =
  | { readonly accepted: true; readonly report: ParsedTestReport }
  | { readonly accepted: false; readonly message: string }

const refusedWith = (message: string): ReadTestReportResult => ({ accepted: false, message })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

const vitestReportOf = (document: Record<string, unknown>): ParsedTestReport | null => {
  const { numTotalTests: total, numPassedTests: passed, numFailedTestSuites: failedSuites } = document
  return isCount(total) && isCount(passed) && isCount(failedSuites) && passed <= total
    ? { source: 'vitest', passed, total, failedSuites }
    : null
}

const stepStatusOf = (step: unknown): string | null =>
  isRecord(step) && isRecord(step.result) && typeof step.result.status === 'string' ? step.result.status : null

const scenarioPassedOf = (element: unknown): boolean | null => {
  if (!isRecord(element) || !Array.isArray(element.steps)) return null
  const statuses = element.steps.map(stepStatusOf)
  return statuses.includes(null) ? null : statuses.every((status) => status === 'passed')
}

const scenarioOutcomesOf = (feature: unknown): (boolean | null)[] =>
  isRecord(feature) && Array.isArray(feature.elements) ? feature.elements.map(scenarioPassedOf) : [null]

const cucumberReportOf = (features: readonly unknown[]): ParsedTestReport | null => {
  const outcomes = features.flatMap(scenarioOutcomesOf)
  return outcomes.includes(null)
    ? null
    : { source: 'cucumber-js', passed: outcomes.filter(Boolean).length, total: outcomes.length, failedSuites: 0 }
}

const reportOf = (document: unknown): ParsedTestReport | null => {
  if (Array.isArray(document)) return cucumberReportOf(document)
  return isRecord(document) ? vitestReportOf(document) : null
}

export const readTestReport = (text: string): ReadTestReportResult => {
  if (text.length > MAX_TEXT_LENGTH) return refusedWith(`exceeds ${MAX_TEXT_LENGTH} characters`)
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    return refusedWith('is not valid JSON')
  }
  const report = reportOf(document)
  return report === null
    ? refusedWith('is not a vitest or cucumber-js JSON report')
    : { accepted: true, report }
}
