import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFactAppender } from './fact-append'
import { appendFact as appendFactOf } from './index'

const realIo = { openSync, readSync, writeSync, closeSync, fstatSync, lstatSync }

// The run ends five seconds after this module loads and lasts a minute: the report (written in
// beforeEach, rewritten by a few tests) falls inside the run, mtime and ctime both.
const durationMs = 60_000
const at = new Date(Date.now() + 5000).toISOString()

const appendFact = (worktree: string, run: { agentType: unknown; at: string; durationMs?: number }) =>
  appendFactOf(worktree, { durationMs, ...run })

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

  it('marks the line only-step, keeping the host role, when the only step in progress is another role', () => {
    writeFileSync(join(agentFlow, 'plan.json'), planWith([stepOf('1', 'dev-a', 'in_progress')]))
    expect(appendFact(worktree, { agentType: 'qa', at })).toEqual({ accepted: true })
    expect(readFileSync(factsPath, 'utf8')).toBe(
      `${JSON.stringify({ at, tool: 'vitest', step: '1', attachment: 'only-step', role: 'qa', roleFrom: 'host', passed: 4, total: 5, failedSuites: 1 })}\n`,
    )
  })

  it('marks the line role when the only step in progress is the role own step', () => {
    writeFileSync(join(agentFlow, 'plan.json'), planWith([stepOf('1', 'qa', 'in_progress')]))
    expect(appendFact(worktree, { agentType: 'qa', at })).toEqual({ accepted: true })
    expect(JSON.parse(readFileSync(factsPath, 'utf8'))).toMatchObject({ step: '1', attachment: 'role' })
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
  ])('marks the line only-step with no role for %s when one step alone is in progress', (_label, agentType) => {
    writeFileSync(join(agentFlow, 'plan.json'), planWith([stepOf('1', 'qa', 'in_progress')]))
    expect(appendFact(worktree, { agentType, at })).toEqual({ accepted: true })
    expect(readFileSync(factsPath, 'utf8')).toBe(
      `${JSON.stringify({ at, tool: 'vitest', step: '1', attachment: 'only-step', role: null, roleFrom: null, passed: 4, total: 5, failedSuites: 1 })}\n`,
    )
  })

  it.each([
    ['another prefix', 'other:qa'],
    ['no agent type (the main session)', undefined],
    ['a non-string agent type', 42],
  ])('writes nothing for %s when several steps are in progress', (_label, agentType) => {
    expect(appendFact(worktree, { agentType, at })).toEqual({
      accepted: false,
      errors: [{ file: 'verified-facts.jsonl', location: null, field: 'role', message: 'has no step in progress' }],
    })
    expect(existsSync(factsPath)).toBe(false)
  })

  it('asks for the step of no role, never of the empty role, so a role-less step is not matched', () => {
    writeFileSync(
      join(agentFlow, 'plan.json'),
      planWith([{ ...stepOf('1', '', 'in_progress'), title: 'a step with no role id' }, stepOf('2', 'dev-a', 'in_progress')]),
    )
    expect(appendFact(worktree, { agentType: undefined, at })).toMatchObject({
      accepted: false,
      errors: [{ file: 'verified-facts.jsonl', field: 'role', message: 'has no step in progress' }],
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
    const result = appendFact(worktree, { agentType: 'qa', at: at.replace('Z', '+00:00') })
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

  // Folders (docs verified-facts.md S12, F5): reports/ and reports/vitest/ are lstat'ed, and O_NOFOLLOW
  // covers the last component only, so a linked folder would send the read outside the worktree.
  const outsideReport = () => {
    const outside = join(root, 'outside')
    mkdirSync(join(outside, 'vitest'), { recursive: true })
    writeFileSync(join(outside, 'vitest', 'vitest.json'), vitestReport(100, 99, 0))
    return outside
  }

  it.each<[string, string[], (outside: string) => string, string]>([
    ['reports/', ['reports'], (outside) => outside, 'reports must be a real directory'],
    ['reports/vitest/', ['reports', 'vitest'], (outside) => join(outside, 'vitest'), 'reports/vitest must be a real directory'],
  ])('refuses %s as a link, reads nothing through it and leaves its target untouched', (_label, folder, target, message) => {
    const outside = outsideReport()
    rmSync(join(worktree, ...folder), { recursive: true })
    symlinkSync(target(outside), join(worktree, ...folder))
    expect(appendFact(worktree, { agentType: 'qa', at })).toEqual({
      accepted: false,
      errors: [{ file: 'reports/vitest/vitest.json', location: null, field: null, message }],
    })
    expect(existsSync(factsPath)).toBe(false)
    expect(readdirSync(join(outside, 'vitest'))).toEqual(['vitest.json'])
  })

  it('refuses reports/vitest as a file', () => {
    rmSync(join(worktree, 'reports', 'vitest'), { recursive: true })
    writeFileSync(join(worktree, 'reports', 'vitest'), '')
    expect(appendFact(worktree, { agentType: 'qa', at })).toMatchObject({
      accepted: false,
      errors: [{ file: 'reports/vitest/vitest.json', message: 'reports/vitest must be a real directory' }],
    })
  })

  it('refuses a folder it cannot lstat, naming it', () => {
    const failing = createFactAppender({
      ...realIo,
      lstatSync: ((path: string, ...rest: never[]) => {
        if (path === join(worktree, 'reports')) throw Object.assign(new Error('denied'), { code: 'EACCES' })
        return (realIo.lstatSync as (path: string, ...rest: never[]) => unknown)(path, ...rest)
      }) as typeof lstatSync,
    })
    expect(failing(worktree, { agentType: 'qa', at, durationMs })).toMatchObject({
      accepted: false,
      errors: [{ file: 'reports/vitest/vitest.json', message: 'reports cannot be read' }],
    })
    expect(existsSync(factsPath)).toBe(false)
  })

  // TOCTOU: a folder swapped for a link between its lstat and the open of the report. The folder
  // chain is resolved again after the open, as confined-append does for .agent-flow, and the
  // counts are dropped when it is no longer the real one.
  it.each([
    ['reports/', ['reports'], (outside: string) => outside],
    ['reports/vitest/', ['reports', 'vitest'], (outside: string) => join(outside, 'vitest')],
  ])('refuses a report read after %s was swapped for a link once checked', (_label, folder, target) => {
    const outside = outsideReport()
    const swapping = createFactAppender({
      ...realIo,
      openSync: ((path: string, ...rest: never[]) => {
        if (path.endsWith('vitest.json')) {
          renameSync(join(worktree, ...folder), join(root, 'moved'))
          symlinkSync(target(outside), join(worktree, ...folder))
        }
        return (realIo.openSync as (path: string, ...rest: never[]) => number)(path, ...rest)
      }) as typeof openSync,
    })
    expect(swapping(worktree, { agentType: 'qa', at, durationMs })).toMatchObject({
      accepted: false,
      errors: [{ file: 'reports/vitest/vitest.json', message: 'reports/vitest must be a real directory' }],
    })
    expect(existsSync(factsPath)).toBe(false)
  })

  it('refuses a report whose folder is gone once read', () => {
    let reportOpened = false
    const moving = createFactAppender({
      ...realIo,
      openSync: ((path: string, ...rest: never[]) => {
        reportOpened ||= path.endsWith('vitest.json')
        return (realIo.openSync as (path: string, ...rest: never[]) => number)(path, ...rest)
      }) as typeof openSync,
      readSync: ((fd: number, ...rest: never[]) => {
        const count = (realIo.readSync as (fd: number, ...rest: never[]) => number)(fd, ...rest)
        if (reportOpened && existsSync(join(worktree, 'reports', 'vitest'))) {
          renameSync(join(worktree, 'reports', 'vitest'), join(root, 'moved'))
        }
        return count
      }) as typeof readSync,
    })
    expect(moving(worktree, { agentType: 'qa', at, durationMs })).toMatchObject({
      accepted: false,
      errors: [{ file: 'reports/vitest/vitest.json', message: 'reports/vitest cannot be read' }],
    })
    expect(existsSync(factsPath)).toBe(false)
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
      { accepted: false, errors: [{ file: 'plan.json' }, { file: 'plan.json' }, { file: 'plan.json' }] },
    ],
    [
      'the role has no step in progress and several others are',
      () => (writeFileSync(join(agentFlow, 'plan.json'), planWith([stepOf('1', 'dev-a', 'in_progress'), stepOf('2', 'dev-b', 'in_progress')])), worktree),
      {
        accepted: false,
        errors: [{ file: 'verified-facts.jsonl', field: 'role', message: 'has no step in progress' }],
      },
    ],
    [
      'no step is in progress',
      () => (writeFileSync(join(agentFlow, 'plan.json'), planWith([stepOf('1', 'qa', 'todo')])), worktree),
      {
        accepted: false,
        errors: [{ file: 'verified-facts.jsonl', field: 'step', message: 'no step is in progress' }],
      },
    ],
    [
      'the report is missing',
      () => (rmSync(join(worktree, 'reports', 'vitest', 'vitest.json')), worktree),
      refusedBy('reports/vitest/vitest.json', 'is missing'),
    ],
    [
      'reports/ is missing',
      () => (rmSync(join(worktree, 'reports'), { recursive: true }), worktree),
      refusedBy('reports/vitest/vitest.json', 'reports is missing'),
    ],
    [
      'reports/vitest/ is missing',
      () => (rmSync(join(worktree, 'reports', 'vitest'), { recursive: true }), worktree),
      refusedBy('reports/vitest/vitest.json', 'reports/vitest is missing'),
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

// Freshness (docs/technical/decisions/verified-facts.md S12): the report counts only when its mtime
// and its ctime, both from the fstat of the opened file, fall in [at - durationMs, at]. utimes
// sets the mtime to any instant, but the ctime becomes the real time of that call, so a test
// builds a window around the ctime it reads back, or puts the window away from the real clock.
describe('appendFact report freshness', () => {
  const stale = {
    accepted: false,
    errors: [{ file: 'reports/vitest/vitest.json', location: null, field: null, message: 'was not written during the run' }],
  }

  const runOf = (end: number, duration: number) => ({
    agentType: 'qa',
    at: new Date(end).toISOString(),
    durationMs: duration,
  })

  // Sets the mtime (seconds are a double: the ms are only as exact as the kernel stores them) and
  // reads both times back as the fstat of the report gives them, in whole milliseconds.
  const touched = (mtimeMs: number) => {
    const report = join(worktree, 'reports', 'vitest', 'vitest.json')
    utimesSync(report, mtimeMs / 1000, mtimeMs / 1000)
    const { mtimeMs: mtime, ctimeMs: ctime } = statSync(report)
    return { mtime: Math.floor(mtime), ctime: Math.floor(ctime) }
  }

  it('writes nothing for a report written before the run', () => {
    const { ctime } = touched(Date.now())
    expect(appendFact(worktree, runOf(ctime + 10_000, 1000))).toEqual(stale)
    expect(existsSync(factsPath)).toBe(false)
  })

  it('writes nothing for a report whose mtime was moved into the run but which was changed before it', () => {
    const end = Date.now() + 10_000
    touched(end - 500)
    expect(appendFact(worktree, runOf(end, 1000))).toEqual(stale)
    expect(existsSync(factsPath)).toBe(false)
    expect(appendFact(worktree, runOf(end, 60_000))).toEqual({ accepted: true })
  })

  // The mtime is set to a fraction of a millisecond, except for the run start: there it is a whole
  // second, so that it is exactly the start (a fraction would make `>` and `>=` the same).
  it.each<[string, (now: number) => number, (mtime: number, ctime: number) => [number, number], (mtime: number, ctime: number) => [number, number]]>([
    ['the run end is the ctime', (now) => now - 100, (_m, c) => [c, 5000], (_m, c) => [c - 1, 5000]],
    ['the run start is the ctime', (now) => now + 2500.5, (_m, c) => [c + 5000, 5000], (_m, c) => [c + 5000, 4999]],
    ['the run end is the mtime', (now) => now + 5000.5, (m) => [m, 60_000], (m) => [m - 1, 60_000]],
    ['the run start is the mtime', (now) => Math.floor(now / 1000) * 1000 - 3000, (m) => [m + 60_000, 60_000], (m) => [m + 60_000, 59_999]],
  ])('takes a report when %s, and refuses it one millisecond outside', (_label, mtimeOf, inside, outside) => {
    const { mtime, ctime } = touched(mtimeOf(Date.now()))
    expect(appendFact(worktree, runOf(...outside(mtime, ctime)))).toEqual(stale)
    expect(existsSync(factsPath)).toBe(false)
    expect(appendFact(worktree, runOf(...inside(mtime, ctime)))).toEqual({ accepted: true })
  })
})
