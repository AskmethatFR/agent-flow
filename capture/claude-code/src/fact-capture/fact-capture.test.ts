import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import { captureFact } from './fact-capture'

const literal = 'npx vitest run --reporter=json --outputFile=reports/vitest/vitest.json'
const end = new Date('2026-11-23T12:00:00.000Z')
const now = () => end

const qaStep = {
  id: '7',
  title: 'qa: review',
  role: 'qa',
  status: 'in_progress',
  origin: 'planned',
  startedAt: '2026-11-23T11:00:00.000Z',
  endedAt: null,
}

const passing = (overlays: Record<string, unknown> = {}, response: Record<string, unknown> = {}) =>
  JSON.stringify({
    hook_event_name: 'PostToolUse',
    agent_type: 'qa',
    tool_name: 'Bash',
    tool_input: { command: literal, description: 'Run vitest' },
    tool_response: { stdout: 'JSON report written', stderr: '', interrupted: false, isImage: false, ...response },
    duration_ms: 631,
    ...overlays,
  })

let root: string
let worktree: string
let factsPath: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'fact-capture-')))
  worktree = join(root, 'worktree')
  factsPath = join(worktree, '.agent-flow', 'verified-facts.jsonl')
  mkdirSync(join(worktree, '.agent-flow'), { recursive: true })
  mkdirSync(join(worktree, 'reports', 'vitest'), { recursive: true })
  writeFileSync(join(worktree, '.agent-flow', 'plan.json'), JSON.stringify({ issue: '#128', title: 'Facts', steps: [qaStep] }))
  writeFileSync(
    join(worktree, 'reports', 'vitest', 'vitest.json'),
    JSON.stringify({ numTotalTests: 9, numPassedTests: 8, numFailedTestSuites: 1 }),
  )
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('captureFact', () => {
  it('appends one fact, at the run end, for a passing run of the literal vitest command', () => {
    expect(captureFact(passing(), worktree, now)).toEqual({ accepted: true })
    expect(readFileSync(factsPath, 'utf8')).toBe(
      `${JSON.stringify({ at: end.toISOString(), tool: 'vitest', step: '7', attachment: 'role', role: 'qa', roleFrom: 'host', passed: 8, total: 9, failedSuites: 1 })}\n`,
    )
  })

  it('appends one fact for the literal command without npx', () => {
    const command = 'vitest run --reporter=json --outputFile=reports/vitest/vitest.json'
    expect(captureFact(passing({ tool_input: { command } }), worktree, now)).toEqual({ accepted: true })
    expect(JSON.parse(readFileSync(factsPath, 'utf8'))).toMatchObject({ step: '7', passed: 8, total: 9 })
  })

  it.each([
    ['an echo into the report path', 'echo {} > reports/vitest/vitest.json'],
    ['a chained command', `${literal}; true`],
    ['an extra argument', `${literal} tests/a.test.ts`],
    ['a trailing space', `${literal} `],
    ['a leading environment assignment', `NODE_OPTIONS=--require=x ${literal}`],
    ['another output file', 'npx vitest run --reporter=json --outputFile=reports/vitest/other.json'],
    ['no command', undefined],
  ])('writes nothing for %s', (_label, command) => {
    expect(captureFact(passing({ tool_input: { command } }), worktree, now)).toBeUndefined()
    expect(existsSync(factsPath)).toBe(false)
  })

  it.each([
    ['an interrupted run', passing({}, { interrupted: true })],
    ['a run whose interrupted flag is missing', passing({ tool_response: { stdout: '' } })],
    ['a run moved to the background, not ended', passing({}, { backgroundTaskId: 'b1', timedOutAfterMs: 3000 })],
    ['a run moved to the background, whatever its interrupted flag', passing({ tool_response: { backgroundTaskId: 'b1' } })],
    ['a PreToolUse event', passing({ hook_event_name: 'PreToolUse' })],
    ['an event with no name', passing({ hook_event_name: undefined })],
    ['another tool', passing({ tool_name: 'Agent' })],
    ['no tool name', passing({ tool_name: undefined })],
  ])('writes nothing for %s', (_label, input) => {
    expect(captureFact(input, worktree, now)).toBeUndefined()
    expect(existsSync(factsPath)).toBe(false)
  })

  const failing = (overlays: Record<string, unknown> = {}) =>
    passing({
      hook_event_name: 'PostToolUseFailure',
      tool_response: undefined,
      error: 'Exit code 1\nJSON report written',
      is_interrupt: false,
      ...overlays,
    })

  it('appends one fact for a failing run, which the host delivers as PostToolUseFailure', () => {
    expect(captureFact(failing(), worktree, now)).toEqual({ accepted: true })
    expect(JSON.parse(readFileSync(factsPath, 'utf8'))).toMatchObject({ step: '7', role: 'qa', passed: 8, failedSuites: 1 })
  })

  it.each([
    ['an interrupted failing run', failing({ is_interrupt: true })],
    ['a failing run whose interrupt flag is missing', failing({ is_interrupt: undefined })],
    ['a failing run of another tool', failing({ tool_name: 'Agent' })],
  ])('writes nothing for %s', (_label, input) => {
    expect(captureFact(input, worktree, now)).toBeUndefined()
    expect(existsSync(factsPath)).toBe(false)
  })

  it.each([
    ['no project directory', undefined],
    ['an empty project directory', ''],
  ])('writes nothing with %s', (_label, projectDir) => {
    expect(captureFact(passing(), projectDir, now)).toBeUndefined()
    expect(existsSync(factsPath)).toBe(false)
  })

  it.each(['garbage', '', 'null', '[]', '42', '"text"', passing({ tool_input: 'text' })])('writes nothing for the input %j', (input) => {
    expect(captureFact(input, worktree, now)).toBeUndefined()
  })

  const paddedTo = (length: number): string => {
    const event = passing({ padding: '' })
    return event.replace('"padding":""', `"padding":"${'x'.repeat(length - event.length)}"`)
  }

  it('reads an input of exactly MAX_TEXT_LENGTH characters', () => {
    expect(captureFact(paddedTo(MAX_TEXT_LENGTH), worktree, now)).toEqual({ accepted: true })
  })

  it('writes nothing for an input one character past MAX_TEXT_LENGTH', () => {
    expect(captureFact(paddedTo(MAX_TEXT_LENGTH + 1), worktree, now)).toBeUndefined()
    expect(existsSync(factsPath)).toBe(false)
  })
})
