import planSchema from '../../../schemas/plan.schema.json' with { type: 'json' }
import { MAX_TEXT_LENGTH, capErrors, safeLabel } from './contract-error'
import type { ContractError, ValidationResult } from './contract-error'
import { findViolations } from './schema-subset'
import type { SchemaViolation } from './schema-subset'

const file = 'plan.json'

export type PlanStep = {
  readonly id: string
  readonly title: string
  readonly role: string
  readonly status: 'todo' | 'in_progress' | 'done'
  readonly origin: 'planned' | 'proposed'
  readonly startedAt: string | null
  readonly endedAt: string | null
}

export type Plan = {
  readonly issue: string
  readonly title: string
  readonly steps: readonly PlanStep[]
}

export type ReadPlanResult =
  | { readonly accepted: true; readonly plan: Plan }
  | { readonly accepted: false; readonly errors: readonly [ContractError, ...ContractError[]] }

const rejectedWith = (message: string): ReadPlanResult => ({
  accepted: false,
  errors: [{ file, location: null, field: null, message }],
})

const stepLocation = (document: unknown, index: number): string => {
  const step = (document as { steps: readonly unknown[] }).steps[index]
  return safeLabel((step as { id?: unknown } | null)?.id) ?? `steps[${index}]`
}

const toContractError = (violation: SchemaViolation, document: unknown): ContractError => {
  const [head, index, field] = violation.path
  const isStepLevel = typeof index === 'number'
  const location = isStepLevel ? stepLocation(document, index) : null
  const name = isStepLevel ? field : head
  const label = safeLabel(name)
  if (name !== undefined && label === null) {
    return { file, location, field: null, message: 'has a field whose name cannot be shown' }
  }
  return { file, location, field: label, message: violation.message }
}

function* schemaErrors(document: unknown): Generator<ContractError> {
  for (const violation of findViolations(planSchema, document)) {
    yield toContractError(violation, document)
  }
}

function* duplicateIdErrors(document: unknown): Generator<ContractError> {
  const seen = new Set<string>()
  const { steps } = document as { steps: readonly { id: string }[] }
  for (const [index, { id }] of steps.entries()) {
    if (seen.has(id)) {
      yield { file, location: stepLocation(document, index), field: 'id', message: 'must be unique' }
    }
    seen.add(id)
  }
}

const errorsOf = (document: unknown): ContractError[] => {
  const invalid = capErrors(file, schemaErrors(document))
  return invalid.length > 0 ? invalid : capErrors(file, duplicateIdErrors(document))
}

export const readPlan = (text: string): ReadPlanResult => {
  if (text.length > MAX_TEXT_LENGTH) return rejectedWith(`exceeds ${MAX_TEXT_LENGTH} characters`)
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    return rejectedWith('is not valid JSON')
  }
  const [first, ...rest] = errorsOf(document)
  if (first === undefined) return { accepted: true, plan: document as Plan }
  return { accepted: false, errors: [first, ...rest] }
}

export function validatePlan(text: string): ValidationResult {
  const result = readPlan(text)
  return result.accepted ? { accepted: true } : result
}
