import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createContractCheck } from './contract-check'
import type { ContractCheckIo } from './contract-check'

const plan = JSON.stringify({
  issue: '#17',
  title: 'Contract check',
  steps: [
    {
      id: 's1',
      title: 'Implementation',
      role: 'dev-a',
      status: 'in_progress',
      origin: 'planned',
      startedAt: '2026-01-01T10:00:00.000Z',
      endedAt: null,
    },
  ],
})

const decision = JSON.stringify({
  at: '2026-01-01T10:05:00.000Z',
  step: 's1',
  role: 'dev-a',
  kind: 'decision',
  title: 'Use a factory',
  why: 'It keeps the seam narrow',
  confidence: 'high',
})

const realIo: ContractCheckIo = { openSync, readSync, closeSync, readdirSync }

let root: string
let worktree: string
let directory: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'contract-check-')))
  worktree = join(root, 'worktree')
  directory = join(worktree, '.agent-flow')
  mkdirSync(directory, { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const check = (target = worktree, io: ContractCheckIo = realIo) => createContractCheck(io)(target)

const refusal = (message: string, file = '.agent-flow', location: string | null = null) => ({
  accepted: false,
  errors: [{ file, location, field: null, message }],
})

describe('createContractCheck', () => {
  it('reports every contract file that honours its contract, sorted', () => {
    writeFileSync(join(directory, 'plan.json'), plan)
    writeFileSync(join(directory, 'decisions.jsonl'), `${decision}\n`)

    expect(check()).toEqual({ accepted: true, checked: ['decisions.jsonl', 'plan.json'] })
  })

  it('sorts the names whatever order the directory lists them in', () => {
    writeFileSync(join(directory, 'plan.json'), plan)
    writeFileSync(join(directory, 'decisions.jsonl'), `${decision}\n`)
    const unsorted: ContractCheckIo = { ...realIo, readdirSync: (() => ['plan.json', 'decisions.jsonl']) as never }

    expect(check(worktree, unsorted)).toEqual({ accepted: true, checked: ['decisions.jsonl', 'plan.json'] })
  })

  it('requires neither plan.json nor decisions.jsonl', () => {
    expect(check()).toEqual({ accepted: true, checked: [] })
  })

  it('reports a malformed decisions line with its line number', () => {
    writeFileSync(join(directory, 'decisions.jsonl'), `${decision}\n{nope\n`)

    const result = check()

    expect(result.accepted).toBe(false)
    if (result.accepted) return
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ file: 'decisions.jsonl', location: 2 })
  })

  it('collects the errors of every file, in name order', () => {
    writeFileSync(join(directory, 'plan.json'), '{}')
    writeFileSync(join(directory, 'decisions.jsonl'), '{nope\n')
    writeFileSync(join(directory, 'scope.json'), '[]')

    const result = check()

    expect(result.accepted).toBe(false)
    if (result.accepted) return
    const files = result.errors.map((error) => error.file)
    expect(files[0]).toBe('decisions.jsonl')
    expect(new Set(files)).toEqual(new Set(['decisions.jsonl', 'plan.json', 'scope.json']))
    expect(files.indexOf('plan.json')).toBeLessThan(files.indexOf('scope.json'))
  })

  it('reports a file that is not a contract without opening it', () => {
    writeFileSync(join(directory, 'notes.txt'), 'x')
    const opened: string[] = []
    const spy: ContractCheckIo = {
      ...realIo,
      openSync: ((path: string, ...rest: never[]) => {
        opened.push(path)
        return (openSync as (...args: unknown[]) => number)(path, ...rest)
      }) as never,
    }

    expect(check(worktree, spy)).toEqual(refusal('is not a contract file', '.agent-flow', 'notes.txt'))
    expect(opened).toEqual([])
  })

  it('reports a leftover temporary file', () => {
    writeFileSync(join(directory, '.plan.json.x.tmp'), plan)

    expect(check()).toEqual(refusal('is not a contract file', '.agent-flow', '.plan.json.x.tmp'))
  })

  it('refuses a symlinked contract file', () => {
    writeFileSync(join(root, 'target.json'), plan)
    symlinkSync(join(root, 'target.json'), join(directory, 'plan.json'))

    expect(check()).toEqual(refusal('must be a regular file, not a link', 'plan.json'))
  })

  it('refuses a contract file that is a directory', () => {
    mkdirSync(join(directory, 'scope.json'))

    expect(check()).toEqual(refusal('must be a regular file, not a link', 'scope.json'))
  })

  it('refuses a symlinked .agent-flow', () => {
    rmSync(directory, { recursive: true })
    mkdirSync(join(root, 'elsewhere'))
    symlinkSync(join(root, 'elsewhere'), directory)

    expect(check()).toEqual(refusal('.agent-flow must be a real directory'))
  })

  it('refuses a .agent-flow that is a regular file', () => {
    rmSync(directory, { recursive: true })
    writeFileSync(directory, 'x')

    expect(check()).toEqual(refusal('.agent-flow must be a real directory'))
  })

  it('reports a missing .agent-flow and creates nothing', () => {
    rmSync(directory, { recursive: true })

    expect(check()).toEqual(refusal('.agent-flow is missing'))
    expect(readdirSync(worktree)).toEqual([])
  })

  it.each(['relative/worktree', '/tmp/../tmp', '/tmp/./x'])('refuses the worktree path %s', (path) => {
    expect(check(path)).toEqual(refusal('worktree must be an absolute path without . or .. segments'))
  })

  it('refuses a worktree that cannot be resolved', () => {
    expect(check(join(root, 'absent'))).toEqual(refusal('worktree cannot be resolved'))
  })

  it('refuses a .agent-flow it cannot list', () => {
    const failing: ContractCheckIo = {
      ...realIo,
      readdirSync: (() => {
        throw new Error('denied')
      }) as never,
    }

    expect(check(worktree, failing)).toEqual(refusal('.agent-flow cannot be read'))
  })

  it('never writes under the worktree', () => {
    writeFileSync(join(directory, 'plan.json'), plan)
    writeFileSync(join(directory, 'notes.txt'), 'x')

    check()

    expect(readdirSync(directory).sort()).toEqual(['notes.txt', 'plan.json'])
    expect(readFileSync(join(directory, 'plan.json'), 'utf8')).toBe(plan)
  })
})
