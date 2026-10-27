import decisionsSchema from '../../../schemas/decisions.schema.json' with { type: 'json' }
import type { ContractError, ValidationResult } from './contract-error'
import { MAX_TEXT_LENGTH, capErrors, safeLabel } from './contract-error'
import { findViolations } from './schema-subset'
import type { SchemaViolation } from './schema-subset'

const file = 'decisions.jsonl'

export type Decision = {
  readonly at: string
  readonly step: string
  readonly role: string
  readonly model?: string
  readonly kind: 'decision' | 'step_event' | 'question' | 'deviation'
  readonly title: string
  readonly why: string
  readonly rejected?: readonly string[]
  readonly confidence: 'high' | 'medium' | 'low'
}

export type ReadDecisionsResult = {
  readonly decisions: readonly Decision[]
  readonly errors: readonly ContractError[]
}

export type SerializeDecisionResult =
  | { readonly accepted: true; readonly line: string }
  | { readonly accepted: false; readonly error: ContractError }

const rejectedWith = (message: string): ReadDecisionsResult => ({
  decisions: [],
  errors: [{ file, location: null, field: null, message }],
})

const firstViolation = (document: unknown): SchemaViolation | undefined => {
  const [violation] = findViolations(decisionsSchema, document)
  return violation
}

const violationError = (violation: SchemaViolation, location: number | null): ContractError => ({
  file,
  location,
  field: safeLabel(violation.path[0]),
  message: violation.message,
})

const lineError = (location: number | null, message: string): ContractError => ({
  file,
  location,
  field: null,
  message,
})

const blankLine = /^[ \t\r]*$/
const requiredKeys = decisionsSchema.required

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const missingRequiredKey = (document: unknown): string | undefined => {
  if (!isPlainObject(document)) return undefined
  for (const key of requiredKeys) {
    if (!Object.hasOwn(document, key)) return key
  }
  return undefined
}

export const readDecisions = (text: string): ReadDecisionsResult => {
  if (text.length > MAX_TEXT_LENGTH) return rejectedWith(`exceeds ${MAX_TEXT_LENGTH} characters`)
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  const decisions: Decision[] = []
  const errors: ContractError[] = []
  for (const [index, line] of lines.entries()) {
    const location = index + 1
    if (blankLine.test(line)) {
      errors.push(lineError(location, 'is not valid JSON'))
      continue
    }
    let document: unknown
    try {
      document = JSON.parse(line)
    } catch {
      errors.push(lineError(location, 'is not valid JSON'))
      continue
    }
    const missing = missingRequiredKey(document)
    const violation =
      missing === undefined ? firstViolation(document) : { path: [missing], message: 'is required' }
    if (violation !== undefined) {
      errors.push(violationError(violation, location))
      continue
    }
    decisions.push(document as Decision)
  }
  return { decisions, errors: capErrors(file, errors) }
}

export const validateDecisions = (text: string): ValidationResult => {
  const { errors } = readDecisions(text)
  const [first, ...rest] = errors
  if (first === undefined) return { accepted: true }
  return { accepted: false, errors: [first, ...rest] }
}

const notSerializable = (): SerializeDecisionResult => ({
  accepted: false,
  error: { file, location: null, field: null, message: 'is not serializable' },
})

export const serializeDecision = (value: unknown): SerializeDecisionResult => {
  let emitted: unknown
  try {
    emitted = JSON.stringify(value)
  } catch {
    return notSerializable()
  }
  if (typeof emitted !== 'string') return notSerializable()
  const line = emitted
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
    .replaceAll('\u0085', '\\u0085')
  if (line.length > MAX_TEXT_LENGTH) {
    return { accepted: false, error: lineError(null, `exceeds ${MAX_TEXT_LENGTH} characters`) }
  }
  const document: unknown = JSON.parse(line)
  const violation = firstViolation(document)
  if (violation !== undefined) {
    return { accepted: false, error: violationError(violation, null) }
  }
  return { accepted: true, line }
}
