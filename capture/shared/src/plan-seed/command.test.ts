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

  it('reports a plan of another issue as one JSON line and exits 3', () => {
    mkdirSync(join(worktree, '.agent-flow'))
    writeFileSync(planPath, '{}')

    expect(run(worktree, '78', title)).toBe(3)
    expect(errors).toEqual([
      `${JSON.stringify({
        errors: [{ file: 'plan.json', location: null, field: null, message: 'already exists' }],
      })}\n`,
    ])
    expect(readFileSync(planPath, 'utf8')).toBe('{}')
  })

  it('exits 0 and stays silent when the plan already names the same issue', () => {
    mkdirSync(join(worktree, '.agent-flow'))
    writeFileSync(planPath, seededText.replace(title, 'Another title'))

    expect(run(worktree, '78', title)).toBe(0)
    expect(errors).toEqual([])
    expect(readFileSync(planPath, 'utf8')).toBe(seededText.replace(title, 'Another title'))
  })

  it.each<[string, string, string, string]>([
    ['an issue that is not a number', 'seventy-eight', title, 'issue'],
    ['an issue with a leading zero', '078', title, 'issue'],
    ['a blank title', '78', '   ', 'title'],
    ['an empty title', '78', '', 'title'],
  ])('reports %s, exits 1 and writes nothing', (_name, issue, titleArgument, field) => {
    expect(run(worktree, issue, titleArgument)).toBe(1)
    expect(errors).toHaveLength(1)
    expect(JSON.parse(errors[0] as string).errors[0]).toMatchObject({ file: 'plan.json', field })
    expect(() => readFileSync(planPath)).toThrow()
  })

  it('exits 1 and not 3 when the worktree cannot be resolved', () => {
    expect(run(join(root, 'absent'), '78', title)).toBe(1)
    expect(JSON.parse(errors[0] as string).errors[0]).toMatchObject({ message: 'worktree cannot be resolved' })
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

  it('exits 3 when a plan of another issue exists and leaves it untouched', () => {
    mkdirSync(join(worktree, '.agent-flow'))
    writeFileSync(planPath, seededText.replace('#78', '#34'))

    const result = spawnSync(process.execPath, [launcher, worktree, '78', title], {
      cwd: root,
      encoding: 'utf8',
    })

    expect(result.status).toBe(3)
    expect(readFileSync(planPath, 'utf8')).toBe(seededText.replace('#78', '#34'))
  })
})
