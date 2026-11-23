import verifiedFactsSchema from '../../schemas/verified-facts.schema.json' with { type: 'json' }
import type { ValidationResult } from './contract-error'
import { validateJsonl } from './jsonl'
import type { JsonlContract } from './jsonl'

export const verifiedFactsContract: JsonlContract = {
  file: 'verified-facts.jsonl',
  schema: verifiedFactsSchema,
  minimumRecordLength: 138,
}

export const validateVerifiedFacts = (text: string): ValidationResult =>
  validateJsonl(verifiedFactsContract, text)
