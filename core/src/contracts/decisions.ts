import decisionsSchema from '../../../schemas/decisions.schema.json' with { type: 'json' }
import type { ContractError, ValidationResult } from './contract-error'
import { MAX_TEXT_LENGTH } from './contract-error'
import { firstViolation, lineError, readJsonl, validateJsonl, violationError } from './jsonl'
import type { JsonlContract } from './jsonl'

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

const contract: JsonlContract = {
  file,
  schema: decisionsSchema,
  minimumRecordLength: 91,
}

export const readDecisions = (text: string): ReadDecisionsResult => {
  const { records, errors } = readJsonl(contract, text)
  return { decisions: records as Decision[], errors }
}

export const validateDecisions = (text: string): ValidationResult => validateJsonl(contract, text)

const notSerializable = (): SerializeDecisionResult => ({
  accepted: false,
  error: lineError(file, null, 'is not serializable'),
})

export const serializeDecision = (value: unknown): SerializeDecisionResult => {
  try {
    const line = JSON.stringify(value)
      .replaceAll('\u2028', '\\u2028')
      .replaceAll('\u2029', '\\u2029')
      .replaceAll('\u0085', '\\u0085')
    if (line.length > MAX_TEXT_LENGTH - 1) {
      return { accepted: false, error: lineError(file, null, `exceeds ${MAX_TEXT_LENGTH} characters`) }
    }
    const document: unknown = JSON.parse(line)
    const violation = firstViolation(decisionsSchema, document)
    if (violation !== undefined) {
      return { accepted: false, error: violationError(file, violation, null) }
    }
    return { accepted: true, line }
  } catch {
    return notSerializable()
  }
}
