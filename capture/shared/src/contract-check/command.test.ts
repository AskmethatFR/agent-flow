import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runContractCheckCommand } from './command'

const usage = 'usage: agent-flow-check <worktree>\n'

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

let root: string
let worktree: string
let directory: string
let out: string[]
let errors: string[]

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'check-command-')))
  worktree = join(root, 'worktree')
  directory = join(worktree, '.agent-flow')
  mkdirSync(directory, { recursive: true })
  out = []
  errors = []
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const run = (...args: string[]): number =>
  runContractCheckCommand(
    args,
    (text) => out.push(text),
    (text) => errors.push(text),
  )

describe('runContractCheckCommand', () => {
  it('prints the checked files as one JSON line on stdout and exits 0', () => {
    writeFileSync(join(directory, 'plan.json'), plan)

    expect(run(worktree)).toBe(0)
    expect(out).toEqual([`${JSON.stringify({ checked: ['plan.json'] })}\n`])
    expect(errors).toEqual([])
  })

  it('prints the errors as one JSON line on stderr and exits 1', () => {
    writeFileSync(join(directory, 'decisions.jsonl'), '{nope\n')

    expect(run(worktree)).toBe(1)
    expect(out).toEqual([])
    expect(errors).toHaveLength(1)
    const [line] = errors as [string]
    expect(line.endsWith('\n')).toBe(true)
    expect(line.slice(0, -1)).not.toContain('\n')
    expect(JSON.parse(line).errors[0]).toMatchObject({ file: 'decisions.jsonl', location: 1 })
  })

  it.each<[string, string[]]>([
    ['no argument', []],
    ['two arguments', ['/tmp', 'extra']],
  ])('prints the usage and exits 2 with %s', (_name, args) => {
    expect(run(...args)).toBe(2)
    expect(out).toEqual([])
    expect(errors).toEqual([usage])
  })

  it('refuses a relative worktree', () => {
    expect(run('worktree')).toBe(1)
    expect(JSON.parse(errors[0] as string).errors[0]).toMatchObject({ file: '.agent-flow' })
  })

  it('writes nothing under the worktree', () => {
    run(worktree)

    expect(readdirSync(directory)).toEqual([])
  })
})

describe('agent-flow-check launcher', { timeout: 20_000 }, () => {
  const launcher = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'agent-flow-check.mjs')
  const launch = (...args: string[]) => spawnSync(process.execPath, [launcher, ...args], { cwd: root, encoding: 'utf8' })

  it('prints the checked files on stdout and exits 0', () => {
    writeFileSync(join(directory, 'plan.json'), plan)

    const result = launch(worktree)

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ checked: ['plan.json'] })
    expect(result.stderr).toBe('')
  })

  it('exits 1 with the errors on stderr when a contract is violated', () => {
    writeFileSync(join(directory, 'plan.json'), '{}')

    const result = launch(worktree)

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(JSON.parse(result.stderr).errors[0]).toMatchObject({ file: 'plan.json' })
  })

  it('exits 2 with the usage on bad arguments', () => {
    const result = launch()

    expect(result.status).toBe(2)
    expect(result.stderr).toBe(usage)
  })
})
