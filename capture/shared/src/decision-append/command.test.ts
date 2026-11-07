import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runDecisionCommand } from './command'

const decision = {
  at: '2026-01-01T10:05:00.000Z',
  step: 's1',
  role: 'dev-a',
  kind: 'decision',
  title: 'Use a factory',
  why: 'It keeps the seam narrow',
  confidence: 'high',
}

const usage = 'usage: agent-flow-decision <worktree> <decision-json>\n'

let root: string
let worktree: string
let decisionsPath: string
let errors: string[]

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'decision-command-')))
  worktree = join(root, 'worktree')
  mkdirSync(join(worktree, '.agent-flow'), { recursive: true })
  decisionsPath = join(worktree, '.agent-flow', 'decisions.jsonl')
  errors = []
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const givenStepInProgress = (id: string): void =>
  writeFileSync(
    join(worktree, '.agent-flow', 'plan.json'),
    JSON.stringify({
      issue: '#35',
      title: 'Appender',
      steps: [
        {
          id,
          title: 'T',
          role: 'dev-a',
          status: 'in_progress',
          origin: 'planned',
          startedAt: '2026-01-01T10:00:00.000Z',
          endedAt: null,
        },
      ],
    }),
  )

const run = (...args: string[]): number => runDecisionCommand(args, (text) => errors.push(text))

describe('runDecisionCommand', () => {
  it('appends the decision, exits 0 and stays silent', () => {
    givenStepInProgress('s1')

    expect(run(worktree, JSON.stringify(decision))).toBe(0)
    expect(errors).toEqual([])
    expect(readFileSync(decisionsPath, 'utf8')).toBe(`${JSON.stringify(decision)}\n`)
  })

  it.each<[string, string[]]>([
    ['no argument', []],
    ['one argument', ['/tmp']],
    ['three arguments', ['/tmp', '{}', 'extra']],
  ])('prints the usage and exits 2 with %s', (_name, args) => {
    expect(run(...args)).toBe(2)
    expect(errors).toEqual([usage])
  })

  it('refuses text that is not JSON and writes nothing', () => {
    expect(run(worktree, '{nope')).toBe(1)
    expect(errors).toEqual([
      `${JSON.stringify({
        errors: [{ file: 'decisions.jsonl', location: null, field: null, message: 'is not valid JSON' }],
      })}\n`,
    ])
    expect(() => readFileSync(decisionsPath)).toThrow()
  })

  it('reports a refusal as one JSON line and exits 1', () => {
    givenStepInProgress('s1')

    expect(run(worktree, JSON.stringify({ ...decision, confidence: 'certain' }))).toBe(1)
    expect(errors).toHaveLength(1)
    const [line] = errors as [string]
    expect(line.endsWith('\n')).toBe(true)
    expect(line.slice(0, -1)).not.toContain('\n')
    expect(JSON.parse(line).errors[0]).toMatchObject({ file: 'decisions.jsonl', field: 'confidence' })
  })

  it('defaults the step from the plan in progress', () => {
    const { step: _step, ...withoutStep } = decision
    givenStepInProgress('s7')

    expect(run(worktree, JSON.stringify(withoutStep))).toBe(0)
    expect(JSON.parse(readFileSync(decisionsPath, 'utf8')).step).toBe('s7')
  })
})

describe('agent-flow-decision launcher', () => {
  const launcher = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'bin',
    'agent-flow-decision.mjs',
  )

  it('appends a decision from a shell and exits 0', () => {
    givenStepInProgress('s1')

    execFileSync(process.execPath, [launcher, worktree, JSON.stringify(decision)], { cwd: root })

    expect(readFileSync(decisionsPath, 'utf8')).toBe(`${JSON.stringify(decision)}\n`)
  })

  it('exits non-zero with the error on stderr when it refuses', () => {
    const { step: _step, ...withoutStep } = decision

    const result = spawnSync(process.execPath, [launcher, worktree, JSON.stringify(withoutStep)], {
      cwd: root,
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(JSON.parse(result.stderr).errors[0]).toMatchObject({ file: 'plan.json' })
  })
})
