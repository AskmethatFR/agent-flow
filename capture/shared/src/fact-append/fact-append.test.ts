import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendFact } from './index'

const at = '2026-11-23T12:00:00.000Z'

const stepOf = (id: string, role: string, status: string) => ({
  id,
  title: `${role}: step ${id}`,
  role,
  status,
  origin: 'planned',
  startedAt: status === 'todo' ? null : '2026-11-23T11:00:00.000Z',
  endedAt: null,
})

const planWith = (steps: readonly unknown[]): string =>
  JSON.stringify({ issue: '#128', title: 'Vitest fact capture', steps })

const vitestReport = (total: number, passed: number, failedSuites: number): string =>
  JSON.stringify({
    numTotalTests: total,
    numPassedTests: passed,
    numFailedTests: total - passed,
    numFailedTestSuites: failedSuites,
    testResults: [{ name: 'a.test.ts', message: 'AssertionError: expected 1 to be 2', assertionResults: [] }],
  })

let root: string
let worktree: string
let agentFlow: string
let factsPath: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'fact-append-')))
  worktree = join(root, 'worktree')
  agentFlow = join(worktree, '.agent-flow')
  factsPath = join(agentFlow, 'verified-facts.jsonl')
  mkdirSync(agentFlow, { recursive: true })
  mkdirSync(join(worktree, 'reports', 'vitest'), { recursive: true })
  writeFileSync(join(agentFlow, 'plan.json'), planWith([stepOf('1', 'dev-a', 'in_progress'), stepOf('2', 'qa', 'in_progress')]))
  writeFileSync(join(worktree, 'reports', 'vitest', 'vitest.json'), vitestReport(5, 4, 1))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('appendFact', () => {
  it('appends the counts of the vitest report on the step of the host-observed role', () => {
    expect(appendFact(worktree, { agentType: 'qa', at })).toEqual({ accepted: true })
    expect(readFileSync(factsPath, 'utf8')).toBe(
      `${JSON.stringify({ at, tool: 'vitest', step: '2', attachment: 'role', role: 'qa', roleFrom: 'host', passed: 4, total: 5, failedSuites: 1 })}\n`,
    )
  })

  it('reads the role of an agent type with the agentic-team: prefix as host-observed', () => {
    expect(appendFact(worktree, { agentType: 'agentic-team:dev-a', at })).toEqual({ accepted: true })
    expect(JSON.parse(readFileSync(factsPath, 'utf8'))).toMatchObject({ step: '1', role: 'dev-a', roleFrom: 'host' })
  })

  it.each([
    ['another prefix', 'other:qa'],
    ['the prefix twice', 'agentic-team:agentic-team:qa'],
    ['an agent name that is no role id', 'general-purpose'],
    ['the bare prefix', 'agentic-team:'],
    ['an empty agent type', ''],
    ['no agent type (the main session)', undefined],
    ['a non-string agent type', 42],
  ])('writes nothing for %s, even when one step alone is in progress', (_label, agentType) => {
    writeFileSync(join(agentFlow, 'plan.json'), planWith([stepOf('1', 'qa', 'in_progress')]))
    expect(appendFact(worktree, { agentType, at })).toEqual({
      accepted: false,
      errors: [{ file: 'verified-facts.jsonl', location: null, field: 'role', message: 'is not host-observed' }],
    })
    expect(existsSync(factsPath)).toBe(false)
  })

  it('writes nothing when the report at the vitest path is a cucumber-js report', () => {
    const scenario = { steps: [{ result: { status: 'passed' } }] }
    writeFileSync(join(worktree, 'reports', 'vitest', 'vitest.json'), JSON.stringify([{ elements: [scenario] }]))
    expect(appendFact(worktree, { agentType: 'qa', at })).toEqual({
      accepted: false,
      errors: [{ file: 'reports/vitest/vitest.json', location: null, field: null, message: 'is not a vitest JSON report' }],
    })
    expect(existsSync(factsPath)).toBe(false)
  })

  it('writes nothing when the line would fail the contract check of verified-facts.jsonl', () => {
    const result = appendFact(worktree, { agentType: 'qa', at: '+010000-01-01T00:00:00.000Z' })
    expect(result).toMatchObject({ accepted: false, errors: [{ file: 'verified-facts.jsonl', location: 1, field: 'at' }] })
    expect(existsSync(factsPath)).toBe(false)
  })

  it('writes under the realpath of a worktree given through a symlink', () => {
    const link = join(root, 'link')
    symlinkSync(worktree, link)
    expect(appendFact(link, { agentType: 'qa', at })).toEqual({ accepted: true })
    expect(JSON.parse(readFileSync(factsPath, 'utf8'))).toMatchObject({ step: '2', role: 'qa' })
  })

  it('refuses a .agent-flow that is a symlink and leaves its target untouched', () => {
    const elsewhere = join(root, 'elsewhere')
    mkdirSync(elsewhere)
    writeFileSync(join(elsewhere, 'plan.json'), readFileSync(join(agentFlow, 'plan.json')))
    rmSync(agentFlow, { recursive: true })
    symlinkSync(elsewhere, agentFlow)
    expect(appendFact(worktree, { agentType: 'qa', at })).toEqual({
      accepted: false,
      errors: [{ file: 'verified-facts.jsonl', location: null, field: null, message: '.agent-flow must be a real directory' }],
    })
    expect(readdirSync(elsewhere)).toEqual(['plan.json'])
  })

  it.each([
    ['a .. segment', () => `${worktree}/reports/..`],
    ['a . segment', () => `${root}/./worktree`],
    ['a relative path', () => 'worktree'],
  ])('refuses a worktree path with %s', (_label, worktreeOf) => {
    expect(appendFact(worktreeOf(), { agentType: 'qa', at })).toEqual({
      accepted: false,
      errors: [
        {
          file: 'verified-facts.jsonl',
          location: null,
          field: null,
          message: 'worktree must be an absolute path without . or .. segments',
        },
      ],
    })
    expect(existsSync(factsPath)).toBe(false)
  })

  const refusedBy = (file: string, message: string) => ({ accepted: false, errors: [{ file, message }] })

  it.each<[string, () => string, object]>([
    [
      'the worktree cannot be resolved',
      () => join(root, 'missing'),
      refusedBy('verified-facts.jsonl', 'worktree cannot be resolved'),
    ],
    [
      '.agent-flow is missing',
      () => (rmSync(agentFlow, { recursive: true }), worktree),
      refusedBy('verified-facts.jsonl', '.agent-flow is missing'),
    ],
    [
      'plan.json is missing',
      () => (rmSync(join(agentFlow, 'plan.json')), worktree),
      refusedBy('plan.json', 'is missing'),
    ],
    [
      'plan.json is contract-invalid',
      () => (writeFileSync(join(agentFlow, 'plan.json'), '{"steps":"none"}'), worktree),
      { accepted: false },
    ],
    [
      'the role has no step in progress and several others are',
      () => (writeFileSync(join(agentFlow, 'plan.json'), planWith([stepOf('1', 'dev-a', 'in_progress'), stepOf('2', 'dev-b', 'in_progress')])), worktree),
      { accepted: false, errors: [{ field: 'role', message: 'has no step in progress' }] },
    ],
    [
      'no step is in progress',
      () => (writeFileSync(join(agentFlow, 'plan.json'), planWith([stepOf('1', 'qa', 'todo')])), worktree),
      { accepted: false, errors: [{ field: 'step', message: 'no step is in progress' }] },
    ],
    [
      'the report is missing',
      () => (rmSync(join(worktree, 'reports', 'vitest', 'vitest.json')), worktree),
      refusedBy('reports/vitest/vitest.json', 'is missing'),
    ],
    [
      'the report is not JSON',
      () => (writeFileSync(join(worktree, 'reports', 'vitest', 'vitest.json'), '{"numTotalTests":'), worktree),
      refusedBy('reports/vitest/vitest.json', 'is not valid JSON'),
    ],
  ])('writes nothing when %s', (_label, arrange, expected) => {
    expect(appendFact(arrange(), { agentType: 'qa', at })).toMatchObject(expected)
    expect(existsSync(factsPath)).toBe(false)
  })
})
