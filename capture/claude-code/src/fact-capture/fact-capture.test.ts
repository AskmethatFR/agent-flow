import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import { captureFact } from './fact-capture'

const literal = 'npx vitest run --reporter=json --outputFile=reports/vitest/vitest.json'
// The run ends five seconds after this module loads and lasts a minute: the report written in
// beforeEach falls inside it, mtime and ctime both.
const end = new Date(Date.now() + 5000)
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
    cwd: worktree,
    agent_type: 'qa',
    tool_name: 'Bash',
    tool_input: { command: literal, description: 'Run vitest' },
    tool_response: { stdout: 'JSON report written', stderr: '', interrupted: false, isImage: false, ...response },
    duration_ms: 60_000,
    ...overlays,
  })

// The paths are fixed at load: the event tables below are built at collection, before any test runs,
// and each event carries the worktree as its cwd. The tree itself is made and removed per test.
const root = realpathSync(mkdtempSync(join(tmpdir(), 'fact-capture-')))
const worktree = join(root, 'worktree')
const factsPath = join(worktree, '.agent-flow', 'verified-facts.jsonl')

beforeEach(() => {
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
    ['a project and a path filter', `${literal} --project=core capture/claude-code/src`],
    ['the fixed flags after the filters', 'vitest run --project=core --outputFile=reports/vitest/vitest.json tests --reporter=json'],
  ])('appends one fact for a command of the vitest grammar with %s', (_label, command) => {
    expect(captureFact(passing({ tool_input: { command } }), worktree, now)).toEqual({ accepted: true })
    expect(JSON.parse(readFileSync(factsPath, 'utf8'))).toMatchObject({ step: '7', passed: 8, total: 9 })
  })

  it.each([
    ['an echo into the report path', 'echo {} > reports/vitest/vitest.json'],
    ['a configuration file', `${literal} --config x`],
    ['a chained command', `${literal}; true`],
    ['an extra argument', `${literal} --watch`],
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

  // Scope (docs verified-facts.md): the hook leaves the worktree alone unless the realpath of the
  // event's cwd is the worktree root, so a subagent run in a subdirectory or elsewhere leaves no line.
  it.each<[string, () => unknown]>([
    ['no cwd', () => undefined],
    ['an empty cwd', () => ''],
    ['a non-string cwd', () => 42],
    ['a cwd that does not resolve', () => join(root, 'missing')],
    ['a subdirectory of the worktree', () => join(worktree, 'reports')],
    ['the parent of the worktree', () => root],
    ['another directory', () => tmpdir()],
    ['a relative path to the worktree', () => relative(process.cwd(), worktree)],
  ])('writes nothing for %s', (_label, cwdOf) => {
    expect(captureFact(passing({ cwd: cwdOf() }), worktree, now)).toBeUndefined()
    expect(existsSync(factsPath)).toBe(false)
  })

  it('writes nothing with an empty project directory, even for a cwd that the empty path resolves to', () => {
    expect(captureFact(passing({ cwd: process.cwd() }), '', now)).toBeUndefined()
  })

  it('leaves a project directory that does not resolve to the refusal of the writer', () => {
    expect(captureFact(passing(), join(root, 'missing'), now)).toEqual({
      accepted: false,
      errors: [{ file: 'verified-facts.jsonl', location: null, field: null, message: 'worktree cannot be resolved' }],
    })
  })

  it('appends one fact when the cwd or the project directory is a link that resolves to the worktree root', () => {
    const link = join(root, 'link')
    symlinkSync(worktree, link)
    expect(captureFact(passing({ cwd: link }), worktree, now)).toEqual({ accepted: true })
    expect(captureFact(passing({ cwd: worktree }), link, now)).toEqual({ accepted: true })
  })

  it.each(['garbage', '', 'null', '[]', '42', '"text"', passing({ tool_input: 'text' })])('writes nothing for the input %j', (input) => {
    expect(captureFact(input, worktree, now)).toBeUndefined()
  })

  const paddedTo = (length: number): string => {
    const event = passing({ padding: '' })
    return event.replace('"padding":""', `"padding":"${'x'.repeat(length - event.length)}"`)
  }

  const stale = {
    accepted: false,
    errors: [{ file: 'reports/vitest/vitest.json', location: null, field: null, message: 'was not written during the run' }],
  }

  it('takes duration_ms as the length of the run that ends at the clock: the report must fall inside it', () => {
    const { mtimeMs, ctimeMs } = statSync(join(worktree, 'reports', 'vitest', 'vitest.json'))
    const endAt = (duration: number) => () => new Date(Math.floor(Math.min(mtimeMs, ctimeMs)) + duration)
    expect(captureFact(passing({ duration_ms: 4999 }), worktree, endAt(5000))).toEqual(stale)
    expect(existsSync(factsPath)).toBe(false)
    expect(captureFact(passing({ duration_ms: 5000 }), worktree, endAt(5000))).toEqual({ accepted: true })
  })

  it('writes nothing for a report older than the run, whatever the event says of the report', () => {
    expect(captureFact(passing({ duration_ms: 1 }), worktree, now)).toEqual(stale)
    expect(existsSync(factsPath)).toBe(false)
  })

  it.each([
    ['no duration_ms', undefined],
    ['a string', '631'],
    ['a fraction', 631.5],
    ['a negative integer', -1],
    ['null (what JSON makes of NaN and Infinity)', null],
    ['an integer past the safe range', Number.MAX_SAFE_INTEGER + 1],
    ['an object', {}],
  ])('writes nothing for a duration_ms that is %s', (_label, duration) => {
    expect(captureFact(passing({ duration_ms: duration }), worktree, now)).toBeUndefined()
    expect(existsSync(factsPath)).toBe(false)
  })

  it.each([
    ['zero', 0, stale],
    ['the largest safe integer', Number.MAX_SAFE_INTEGER, { accepted: true }],
  ])('reads %s as a duration_ms', (_label, duration, expected) => {
    expect(captureFact(passing({ duration_ms: duration }), worktree, now)).toEqual(expected)
  })

  it('reads an input of exactly MAX_TEXT_LENGTH characters', () => {
    expect(captureFact(paddedTo(MAX_TEXT_LENGTH), worktree, now)).toEqual({ accepted: true })
  })

  it('writes nothing for an input one character past MAX_TEXT_LENGTH', () => {
    expect(captureFact(paddedTo(MAX_TEXT_LENGTH + 1), worktree, now)).toBeUndefined()
    expect(existsSync(factsPath)).toBe(false)
  })
})
