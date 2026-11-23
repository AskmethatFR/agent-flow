import { describe, expect, it } from 'vitest'
import { checkContractFile, notContractFileError } from './index'

describe('notContractFileError', () => {
  it('names a stray file as not a contract file', () => {
    expect(notContractFileError('notes.txt')).toEqual({
      file: '.agent-flow',
      location: 'notes.txt',
      field: null,
      message: 'is not a contract file',
    })
  })

  it('never echoes an unsafe name', () => {
    expect(notContractFileError('a b').location).toBeNull()
  })

  it('is the error checkContractFile gives for a name that is not a contract file', () => {
    expect(checkContractFile('notes.txt', '{}')).toEqual({
      accepted: false,
      errors: [notContractFileError('notes.txt')],
    })
  })
})
