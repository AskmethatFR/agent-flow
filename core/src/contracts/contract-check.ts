import type { ContractError, ValidationResult } from './contract-error'
import { safeLabel } from './contract-error'
import { validateDecisions } from './decisions'
import { validatePlan } from './plan'
import { validateRequests } from './requests'
import { validateResponses } from './responses'
import { validateScope } from './scope'
import { validateVerifiedFacts } from './verified-facts'

const validators = new Map<string, (text: string) => ValidationResult>([
  ['decisions.jsonl', validateDecisions],
  ['plan.json', validatePlan],
  ['requests.jsonl', validateRequests],
  ['responses.jsonl', validateResponses],
  ['scope.json', validateScope],
  ['verified-facts.jsonl', validateVerifiedFacts],
])

export const contractFileNames: readonly string[] = [...validators.keys()]

export function notContractFileError(name: string): ContractError {
  return { file: '.agent-flow', location: safeLabel(name), field: null, message: 'is not a contract file' }
}

export function checkContractFile(name: string, text: string): ValidationResult {
  const validate = validators.get(name)
  if (validate !== undefined) return validate(text)
  return { accepted: false, errors: [notContractFileError(name)] }
}
