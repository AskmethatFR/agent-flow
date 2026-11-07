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
  title: `Step ${id}`,
  role: 'dev-a',
  status: 'todo',
  origin: 'planned',
  startedAt: null,
  endedAt: null,
  ...overlays,
})

const payload = (overlays: Record<string, unknown> = {}): string =>
  JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'TaskUpdate',
    tool_input: { taskId: '2' },
    tool_response: { statusChange: { from: 'pending', to: 'in_progress' } },
    ...overlays,
  })

const withStatus = (to: unknown): string => payload({ tool_response: { statusChange: { to } } })

let root: string
let worktree: string
let planPath: string

const seed = (steps: readonly unknown[]): void => {
  writeFileSync(planPath, JSON.stringify({ issue: '#14', title: 'Step timing', steps }))
}
const planText = (): string => readFileSync(planPath, 'utf8')
const stepsNow = (): Record<string, unknown>[] => JSON.parse(planText()).steps

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'step-timing-')))
  worktree = join(root, 'worktree')
  mkdirSync(join(worktree, '.agent-flow'), { recursive: true })
  planPath = join(worktree, '.agent-flow', 'plan.json')
  seed([stepOf('1'), stepOf('2')])
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('captureStepTiming', () => {
  it('starts the step named by taskId with the injected time', () => {
    const result = captureStepTiming(payload(), worktree, () => earlier)
    expect(result).toEqual({ accepted: true })
    expect(stepsNow()[1]).toMatchObject({ id: '2', status: 'in_progress', startedAt: earlier.toISOString() })
  })

  it('finishes a step in progress, endedAt not earlier than startedAt', () => {
    captureStepTiming(payload(), worktree, () => earlier)
    const result = captureStepTiming(withStatus('completed'), worktree, () => later)
    expect(result).toEqual({ accepted: true })
    expect(stepsNow()[1]).toMatchObject({
      status: 'done',
      startedAt: earlier.toISOString(),
      endedAt: later.toISOString(),
    })
  })

  it('closes the step in progress when another starts', () => {
    captureStepTiming(payload({ tool_input: { taskId: '1' } }), worktree, () => earlier)
    captureStepTiming(payload(), worktree, () => later)
    expect(stepsNow()[0]).toMatchObject({ id: '1', status: 'done', endedAt: later.toISOString() })
    expect(stepsNow()[1]).toMatchObject({ id: '2', status: 'in_progress', startedAt: later.toISOString() })
  })

  it('writes a plan that passes the frozen schema and leaves no temporary file', () => {
    captureStepTiming(payload(), worktree, () => earlier)
    expect(validatePlan(planText()).accepted).toBe(true)
    expect(readdirSync(join(worktree, '.agent-flow'))).toEqual(['plan.json'])
  })

  it('returns the writer refusal for an unknown step', () => {
    const result = captureStepTiming(payload({ tool_input: { taskId: '99' } }), worktree, () => earlier)
    expect(result?.accepted).toBe(false)
  })

  it('ignores every payload outside the allowlist and leaves the plan untouched', () => {
    const before = planText()
    const ignored = [
      payload({ hook_event_name: 'PreToolUse' }),
      payload({ hook_event_name: undefined }),
      payload({ tool_name: 'TaskCreate' }),
      payload({ tool_name: undefined }),
      payload({ tool_input: {} }),
      payload({ tool_input: { taskId: '' } }),
      payload({ tool_input: { taskId: 2 } }),
      payload({ tool_input: null }),
      payload({ tool_input: undefined }),
      payload({ tool_response: undefined }),
      payload({ tool_response: null }),
      payload({ tool_response: {} }),
      payload({ tool_response: { statusChange: null } }),
      withStatus('pending'),
      withStatus('deleted'),
      withStatus('constructor'),
      withStatus('toString'),
      withStatus('__proto__'),
      withStatus(undefined),
      withStatus(7),
      '[]',
      'null',
      '"text"',
      '7',
      'not json',
      '',
    ]
    for (const input of ignored) {
      expect(captureStepTiming(input, worktree, () => earlier)).toBeUndefined()
    }
    expect(planText()).toBe(before)
  })

  describe('task creation', () => {
    const created = (id: unknown, subject: unknown, overlays: Record<string, unknown> = {}): string =>
      JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskCreate',
        tool_input: { subject: 'ignored' },
        tool_response: { task: { id, subject } },
        ...overlays,
      })

    it('adds the created task as a planned todo step with the role and title of its subject', () => {
      const result = captureStepTiming(created('3', 'dev-a: Implementation'), worktree, () => earlier)

      expect(result).toEqual({ accepted: true })
      expect(stepsNow()[2]).toEqual(
        stepOf('3', { title: 'Implementation', role: 'dev-a', origin: 'planned' }),
      )
    })

    it('proposes the created task once a step has started', () => {
      captureStepTiming(payload(), worktree, () => earlier)

      captureStepTiming(created('3', 'qa: Extra check'), worktree, () => later)

      expect(stepsNow()[2]).toEqual(stepOf('3', { title: 'Extra check', role: 'qa', origin: 'proposed' }))
    })

    it('writes a plan that passes the frozen schema and leaves no temporary file', () => {
      captureStepTiming(created('3', 'dev-a: Implementation'), worktree, () => earlier)

      expect(validatePlan(planText()).accepted).toBe(true)
      expect(readdirSync(join(worktree, '.agent-flow'))).toEqual(['plan.json'])
    })

    it('times the created task like any other step', () => {
      captureStepTiming(created('3', 'dev-a: Implementation'), worktree, () => earlier)
      captureStepTiming(payload({ tool_input: { taskId: '3' } }), worktree, () => earlier)
      captureStepTiming(
        payload({ tool_input: { taskId: '3' }, tool_response: { statusChange: { to: 'completed' } } }),
        worktree,
        () => later,
      )
      expect(stepsNow()[2]).toMatchObject({
        id: '3',
        status: 'done',
        startedAt: earlier.toISOString(),
        endedAt: later.toISOString(),
      })
    })

    it('accepts a task the plan already holds without touching the plan', () => {
      const before = planText()

      const result = captureStepTiming(created('2', 'dev-a: Again'), worktree, () => earlier)

      expect(result).toEqual({ accepted: true })
      expect(planText()).toBe(before)
    })

    it('returns the writer refusal when the plan is missing', () => {
      rmSync(planPath)

      expect(captureStepTiming(created('3', 'dev-a: Implementation'), worktree, () => earlier)?.accepted).toBe(
        false,
      )
    })

    it('ignores every creation payload that names no usable task and leaves the plan untouched', () => {
      const before = planText()
      const ignored = [
        created('3', 'dev-a: Implementation', { hook_event_name: 'PreToolUse' }),
        created('', 'dev-a: Implementation'),
        created(3, 'dev-a: Implementation'),
        created(undefined, 'dev-a: Implementation'),
        created('3', undefined),
        created('3', 7),
        created('3', 'dev-a: Implementation', { tool_response: undefined }),
        created('3', 'dev-a: Implementation', { tool_response: null }),
        created('3', 'dev-a: Implementation', { tool_response: {} }),
        created('3', 'dev-a: Implementation', { tool_response: { task: null } }),
        created('3', 'dev-a: Implementation', { tool_response: { task: {} } }),
        created('3', 'dev-a: Implementation', { tool_response: { statusChange: { to: 'in_progress' } } }),
      ]
      for (const input of ignored) {
        expect(captureStepTiming(input, worktree, () => earlier)).toBeUndefined()
      }
      expect(planText()).toBe(before)
    })
  })

  it('ignores an input longer than the core text limit even when it is valid', () => {
    const padded = payload({ padding: 'x'.repeat(MAX_TEXT_LENGTH) })
    expect(padded.length).toBeGreaterThan(MAX_TEXT_LENGTH)
    expect(captureStepTiming(padded, worktree, () => earlier)).toBeUndefined()
    expect(stepsNow()[1]).toMatchObject({ status: 'todo' })
  })

  it('accepts an input of exactly the core text limit', () => {
    const base = payload({ padding: '' })
    const padded = payload({ padding: 'x'.repeat(MAX_TEXT_LENGTH - base.length) })
    expect(padded.length).toBe(MAX_TEXT_LENGTH)
    expect(captureStepTiming(padded, worktree, () => earlier)).toEqual({ accepted: true })
  })

  it('ignores a missing or empty project directory', () => {
    expect(captureStepTiming(payload(), undefined, () => earlier)).toBeUndefined()
    expect(captureStepTiming(payload(), '', () => earlier)).toBeUndefined()
    expect(stepsNow()[1]).toMatchObject({ status: 'todo' })
  })

  it('never throws when the writer cannot find the plan', () => {
    rmSync(planPath)
    expect(captureStepTiming(payload(), worktree, () => earlier)?.accepted).toBe(false)
  })
})
