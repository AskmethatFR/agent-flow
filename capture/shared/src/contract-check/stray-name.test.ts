import { closeSync, mkdirSync, mkdtempSync, openSync, readdirSync, readSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { notContractFileError } from '@agent-flow/core/contracts'
import { createContractCheck } from './contract-check'

let root: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'stray-name-')))
  mkdirSync(join(root, '.agent-flow'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('createContractCheck on a stray name', () => {
  it.each(['notes.txt', 'a b'])('reports %j with the error core gives for it', (name) => {
    writeFileSync(join(root, '.agent-flow', name), 'x')

    const result = createContractCheck({ openSync, readSync, closeSync, readdirSync })(root)

    expect(result).toEqual({ accepted: false, errors: [notContractFileError(name)] })
  })
})
