import { describe, expect, it } from 'vitest'
import { MAX_ERRORS, capErrors } from './contract-error'
import type { ContractError } from './contract-error'

describe('capErrors', () => {
  it('stops pulling errors as soon as it knows the cap is exceeded', () => {
    let pulls = 0
    function* manyErrors(): Generator<ContractError> {
      for (let index = 0; index < 10_000; index += 1) {
        pulls += 1
        yield { file: 'plan.json', location: index, field: null, message: 'is wrong' }
      }
    }
    capErrors('plan.json', manyErrors())
    expect(pulls).toBe(MAX_ERRORS + 1)
  })
})
