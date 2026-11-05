import { describe, expect, it } from 'vitest'
import { checkContractFile, contractFileNames } from './index'

const notContract = (location: string | null) => ({
  accepted: false,
  errors: [{ file: '.agent-flow', location, field: null, message: 'is not a contract file' }],
})

describe('checkContractFile', () => {
  it('knows the five contract files, sorted', () => {
    expect(contractFileNames).toEqual([
      'decisions.jsonl',
      'plan.json',
      'requests.jsonl',
      'responses.jsonl',
      'scope.json',
    ])
  })

  it.each(contractFileNames)('judges %s with its own contract', (name) => {
    const result = checkContractFile(name, 'not a contract')

    expect(result.accepted).toBe(false)
    if (result.accepted) return
    expect(result.errors.map((error) => error.file)).toEqual(result.errors.map(() => name))
  })

  it('accepts an empty jsonl file', () => {
    expect(checkContractFile('decisions.jsonl', '')).toEqual({ accepted: true })
  })

  it('rejects a name that is not a contract file and names it', () => {
    expect(checkContractFile('notes.txt', '{}')).toEqual(notContract('notes.txt'))
  })

  it.each(['__proto__', 'constructor', 'toString'])('does not mistake %s for a contract file', (name) => {
    expect(checkContractFile(name, '{}')).toEqual(notContract(name))
  })

  it.each(['a b', 'x\ny', 'é.json', 'a'.repeat(65)])(
    'never echoes the unsafe name %j',
    (name) => {
      expect(checkContractFile(name, '{}')).toEqual(notContract(null))
    },
  )
})
