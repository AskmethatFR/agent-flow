import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_TEXT_LENGTH, validatePlan } from '@agent-flow/core/contracts'
import { captureStepTiming } from './step-timing'

const earlier = new Date('2026-01-01T10:00:00.000Z')
const later = new Date('2026-01-01T10:30:00.000Z')

const stepOf = (id: string, overlays: Record<string, unknown> = {}) => ({
  id,
  title: id,
  role: 'dev-a',
  status: 'todo',
  origin: 'planned',
  startedAt: null,
  endedAt: null,
  ...overlays,
})

type Todo = { content: unknown; status: unknown }

const event = (todos: unknown, overlays: Record<string, unknown> = {}) => ({
  tool: 'todowrite',
  status: 'completed',
  sessionID: 'ses_test',
  input: { todos },
  ...overlays,
})

const todo = (content: unknown, status: unknown): Todo => ({ content, status })

let root: string
let worktree: string
let planPath: string

const seed = (steps: readonly unknown[]): void => {
  writeFileSync(planPath, JSON.stringify({ issue: '#15', title: 'Step timing', steps }))
}
const planText = (): string => readFileSync(planPath, 'utf8')
const stepsNow = (): Record<string, unknown>[] => JSON.parse(planText()).steps

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'opencode-step-timing-')))
  worktree = join(root, 'worktree')
  mkdirSync(join(worktree, '.agent-flow'), { recursive: true })
  planPath = join(worktree, '.agent-flow', 'plan.json')
  seed([stepOf('Architecture'), stepOf('Implementation')])
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('captureStepTiming', () => {
  it('starts the step named by the in_progress todo content with the injected time', () => {
    const results = captureStepTiming(
      event([todo('Architecture', 'pending'), todo('Implementation', 'in_progress')]),
      worktree,
      () => earlier,
    )
    expect(results).toEqual([{ accepted: true }])
    expect(stepsNow()[1]).toMatchObject({ status: 'in_progress', startedAt: earlier.toISOString() })
    expect(stepsNow()[0]).toMatchObject({ status: 'todo', startedAt: null })
  })

  it('finishes an in_progress step from a completed todo with endedAt not earlier than startedAt', () => {
    captureStepTiming(event([todo('Implementation', 'in_progress')]), worktree, () => earlier)
    const results = captureStepTiming(event([todo('Implementation', 'completed')]), worktree, () => later)
    expect(results).toEqual([{ accepted: true }])
    const done = stepsNow()[1] as Record<string, unknown>
    expect(done).toMatchObject({ status: 'done', startedAt: earlier.toISOString(), endedAt: later.toISOString() })
    expect(Date.parse(done.endedAt as string)).toBeGreaterThanOrEqual(Date.parse(done.startedAt as string))
  })

  it('closes the step in progress when another starts', () => {
    captureStepTiming(event([todo('Architecture', 'in_progress'), todo('Implementation', 'pending')]), worktree, () => earlier)
    captureStepTiming(
      event([todo('Architecture', 'in_progress'), todo('Implementation', 'in_progress')]),
      worktree,
      () => later,
    )
    expect(stepsNow()[0]).toMatchObject({ status: 'done', startedAt: earlier.toISOString(), endedAt: later.toISOString() })
    expect(stepsNow()[1]).toMatchObject({ status: 'in_progress', startedAt: later.toISOString() })
  })

  it('applies a finish then a start from one list, with one instant', () => {
    captureStepTiming(event([todo('Architecture', 'in_progress')]), worktree, () => earlier)
    const results = captureStepTiming(
      event([todo('Architecture', 'completed'), todo('Implementation', 'in_progress')]),
      worktree,
      () => later,
    )
    expect(results).toEqual([{ accepted: true }, { accepted: true }])
    expect(stepsNow()[0]).toMatchObject({ status: 'done', endedAt: later.toISOString() })
    expect(stepsNow()[1]).toMatchObject({ status: 'in_progress', startedAt: later.toISOString() })
  })

  it('finishes before it starts even when the in_progress item comes first in the list', () => {
    captureStepTiming(event([todo('Architecture', 'in_progress')]), worktree, () => earlier)
    const results = captureStepTiming(
      event([todo('Implementation', 'in_progress'), todo('Architecture', 'completed')]),
      worktree,
      () => later,
    )
    expect(results).toEqual([{ accepted: true }, { accepted: true }])
    expect(stepsNow()[0]).toMatchObject({ status: 'done', endedAt: later.toISOString() })
    expect(stepsNow()[1]).toMatchObject({ status: 'in_progress', startedAt: later.toISOString() })
  })

  it('takes the clock once per call', () => {
    let calls = 0
    captureStepTiming(
      event([todo('Architecture', 'completed'), todo('Implementation', 'in_progress')]),
      worktree,
      () => {
        calls += 1
        return earlier
      },
    )
    expect(calls).toBe(1)
  })

  it('is a no-op on a repeated identical list', () => {
    const list = [todo('Architecture', 'completed'), todo('Implementation', 'in_progress')]
    captureStepTiming(event([todo('Architecture', 'in_progress')]), worktree, () => earlier)
    captureStepTiming(event(list), worktree, () => later)
    const before = planText()
    const results = captureStepTiming(event(list), worktree, () => new Date('2026-01-02T00:00:00.000Z'))
    expect(results?.every((result) => result.accepted === false)).toBe(true)
    expect(planText()).toBe(before)
  })

  it('writes a plan that passes the frozen schema and leaves no temporary file', () => {
    captureStepTiming(event([todo('Implementation', 'in_progress')]), worktree, () => earlier)
    expect(validatePlan(planText())).toEqual({ accepted: true })
    expect(readdirSync(join(worktree, '.agent-flow'))).toEqual(['plan.json'])
  })

  it('returns the writer refusal for an unknown content and leaves the plan byte-identical', () => {
    const before = planText()
    const results = captureStepTiming(event([todo('No such step', 'in_progress')]), worktree, () => earlier)
    expect(results).toHaveLength(1)
    expect(results?.[0]?.accepted).toBe(false)
    expect(planText()).toBe(before)
  })

  it('does not throw and reports a refusal when plan.json is missing', () => {
    rmSync(planPath)
    const results = captureStepTiming(event([todo('Implementation', 'in_progress')]), worktree, () => earlier)
    expect(results?.[0]?.accepted).toBe(false)
  })

  it('returns an empty list when no item carries a transition', () => {
    expect(captureStepTiming(event([todo('Implementation', 'pending')]), worktree, () => earlier)).toEqual([])
  })

  it.each([undefined, ''])('returns undefined and writes nothing when the worktree is %j', (empty) => {
    const before = planText()
    expect(captureStepTiming(event([todo('Implementation', 'in_progress')]), empty, () => earlier)).toBeUndefined()
    expect(planText()).toBe(before)
  })

  describe('allowlist', () => {
    const untouched = (candidate: unknown): void => {
      const before = planText()
      expect(captureStepTiming(candidate, worktree, () => earlier)).toBeUndefined()
      expect(planText()).toBe(before)
    }
    const inProgress = [todo('Implementation', 'in_progress')]

    it.each([
      ['a non-object event', 'todowrite'],
      ['a null event', null],
      ['an undefined event', undefined],
      ['another tool', event(inProgress, { tool: 'bash' })],
      ['an errored call', event(inProgress, { status: 'error' })],
      ['a missing status', event(inProgress, { status: undefined })],
      ['a missing input', { tool: 'todowrite', status: 'completed' }],
      ['a non-object input', event(inProgress, { input: 'todos' })],
      ['a null input', event(inProgress, { input: null })],
      ['missing todos', event(inProgress, { input: {} })],
      ['non-array todos', event(inProgress, { input: { todos: { 0: todo('Implementation', 'in_progress') } } })],
    ])('ignores %s', (_name, candidate) => {
      untouched(candidate)
    })

    it.each([
      ['a non-object item', 'Implementation'],
      ['a null item', null],
      ['a non-string content', todo(7, 'in_progress')],
      ['an empty content', todo('', 'in_progress')],
      ['an over-long content', todo('x'.repeat(MAX_TEXT_LENGTH + 1), 'in_progress')],
      ['an unknown status', todo('Implementation', 'cancelled')],
      ['a pending item', todo('Implementation', 'pending')],
    ])('skips %s', (_name, item) => {
      const before = planText()
      expect(captureStepTiming(event([item]), worktree, () => earlier)).toEqual([])
      expect(planText()).toBe(before)
    })

    it('hands a content of exactly MAX_TEXT_LENGTH to the writer, which refuses a plan that large', () => {
      const before = planText()
      const results = captureStepTiming(
        event([todo('x'.repeat(MAX_TEXT_LENGTH), 'in_progress')]),
        worktree,
        () => earlier,
      )
      expect(results).toHaveLength(1)
      expect(results?.[0]?.accepted).toBe(false)
      expect(planText()).toBe(before)
    })

    it('reads at most 64 items', () => {
      const names = Array.from({ length: 65 }, (_unused, index) => `Step ${index}`)
      seed(names.map((name) => stepOf(name)))
      const results = captureStepTiming(
        event(names.map((name) => todo(name, 'in_progress'))),
        worktree,
        () => earlier,
      )
      expect(results).toHaveLength(64)
      expect(stepsNow()[64]).toMatchObject({ status: 'todo', startedAt: null })
    })

    it('reads the 64th item', () => {
      const names = Array.from({ length: 64 }, (_unused, index) => `Step ${index}`)
      seed(names.map((name) => stepOf(name, { status: 'in_progress', startedAt: earlier.toISOString() })))
      const items = names.map((name, index) => todo(name, index === 63 ? 'completed' : 'pending'))
      expect(captureStepTiming(event(items), worktree, () => later)).toEqual([{ accepted: true }])
    })

    it('persists nothing from the payload beyond status and timestamps', () => {
      captureStepTiming(
        event([todo('Implementation', 'in_progress')], { result: { output: 'SECRET-OUTPUT' } }),
        worktree,
        () => earlier,
      )
      expect(planText()).not.toContain('SECRET-OUTPUT')
      expect(planText()).not.toContain('ses_test')
    })
  })
})
