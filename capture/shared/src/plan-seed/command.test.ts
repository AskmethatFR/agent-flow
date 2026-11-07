import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runPlanCommand } from './command'

const title = 'Seed plan.json on real runs'
const seededText = `${JSON.stringify({ issue: '#78', title, steps: [] }, null, 2)}\n`
const usage = 'usage: agent-flow-plan <worktree> <issue> <title>\n'

let root: string
let worktree: string
let planPath: string
let errors: string[]

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'plan-command-')))
  worktree = join(root, 'worktree')
  planPath = join(worktree, '.agent-flow', 'plan.json')
  mkdirSync(worktree)
  errors = []
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const run = (...args: string[]): number => runPlanCommand(args, (text) => errors.push(text))

describe('runPlanCommand', () => {
  it('seeds the plan, exits 0 and stays silent', () => {
    expect(run(worktree, '78', title)).toBe(0)
    expect(errors).toEqual([])
    expect(readFileSync(planPath, 'utf8')).toBe(seededText)
  })

  it.each<[string, string[]]>([
    ['no argument', []],
    ['two arguments', ['/tmp', '78']],
    ['four arguments', ['/tmp', '78', 'title', 'extra']],
  ])('prints the usage and exits 2 with %s', (_name, args) => {
    expect(run(...args)).toBe(2)
    expect(errors).toEqual([usage])
  })

  it('reports an existing plan as one JSON line and exits 1', () => {
    mkdirSync(join(worktree, '.agent-flow'))
    writeFileSync(planPath, '{}')

    expect(run(worktree, '78', title)).toBe(1)
    expect(errors).toEqual([
      `${JSON.stringify({
        errors: [{ file: 'plan.json', location: null, field: null, message: 'already exists' }],
      })}\n`,
    ])
    expect(readFileSync(planPath, 'utf8')).toBe('{}')
  })

  it('reports an issue that is not a number and writes nothing', () => {
    expect(run(worktree, 'seventy-eight', title)).toBe(1)
    expect(errors).toHaveLength(1)
    expect(JSON.parse(errors[0] as string).errors[0]).toMatchObject({ file: 'plan.json', field: 'issue' })
    expect(() => readFileSync(planPath)).toThrow()
  })
})

describe('agent-flow-plan launcher', () => {
  const launcher = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'agent-flow-plan.mjs')

  it('seeds the plan from a shell and exits 0', () => {
    execFileSync(process.execPath, [launcher, worktree, '78', title], { cwd: root })

    expect(readFileSync(planPath, 'utf8')).toBe(seededText)
  })

  it('exits non-zero with the error on stderr when it refuses', () => {
    const result = spawnSync(process.execPath, [launcher, worktree, '0', title], {
      cwd: root,
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(JSON.parse(result.stderr).errors[0]).toMatchObject({ file: 'plan.json', field: 'issue' })
  })
})
