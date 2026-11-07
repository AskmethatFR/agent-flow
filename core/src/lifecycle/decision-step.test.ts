import { describe, expect, it } from 'vitest'
import { decisionStepOf } from './index'

const step = (id: string, overlays: Record<string, unknown> = {}) => ({
  id,
  title: 'Implementation',
  role: 'dev-a',
  status: 'todo',
  origin: 'planned',
  startedAt: null,
  endedAt: null,
  ...overlays,
})

const running = (id: string, role: string, startedAt: string | null) =>
  step(id, { role, status: 'in_progress', startedAt })

const done = (id: string, role: string) =>
  step(id, {
    role,
    status: 'done',
    startedAt: '2026-01-01T08:00:00.000Z',
    endedAt: '2026-01-01T09:00:00.000Z',
  })

const planText = (...steps: Record<string, unknown>[]): string =>
  JSON.stringify({ issue: '#89', title: 'Decision step', steps })

const found = (stepId: string) => ({ accepted: true, stepId })

const refusal = (field: string, message: string) => ({
  accepted: false,
  errors: [{ file: 'decisions.jsonl', location: null, field, message }],
})

const early = '2026-01-01T10:00:00.000Z'
const late = '2026-01-01T10:05:00.000Z'

describe('decisionStepOf', () => {
  describe('with one step in progress', () => {
    it.each<[string, unknown]>([
      ['the role of that step', 'dev-a'],
      ['another role', 'qa'],
      ['an empty role', ''],
      ['a missing role', undefined],
      ['a null role', null],
      ['a number as role', 1],
      ['an object as role', { role: 'dev-a' }],
    ])('answers that step for %s', (_name, role) => {
      expect(decisionStepOf(planText(step('s0'), running('s1', 'dev-a', early)), role)).toEqual(
        found('s1'),
      )
    })

    it('answers a step whose start is not an instant', () => {
      expect(decisionStepOf(planText(running('s1', 'dev-a', 'yesterday')), 'qa')).toEqual(
        found('s1'),
      )
    })
  })

  describe('with several steps in progress', () => {
    const parallel = planText(
      running('s1', 'dev-b', early),
      running('s2', 'qa', late),
      running('s3', 'security', '2026-01-01T10:06:00.000Z'),
    )

    it.each([
      ['dev-b', 's1'],
      ['qa', 's2'],
      ['security', 's3'],
    ])('answers the step of role %s, not the one started last', (role, id) => {
      expect(decisionStepOf(parallel, role)).toEqual(found(id))
    })

    it.each<[string, unknown]>([
      ['a role with no step in progress', 'pm'],
      ['an empty role', ''],
      ['a missing role', undefined],
      ['a null role', null],
      ['a number as role', 0],
      ['a role differing by case', 'QA'],
      ['a role differing by a trailing space', 'qa '],
    ])('refuses %s', (_name, role) => {
      expect(decisionStepOf(parallel, role)).toEqual(refusal('role', 'has no step in progress'))
    })

    it('ignores the steps of the role that are not in progress', () => {
      const plan = planText(
        done('s1', 'pm'),
        step('s2', { role: 'pm' }),
        running('s3', 'dev-a', early),
        running('s4', 'qa', late),
      )
      expect(decisionStepOf(plan, 'pm')).toEqual(refusal('role', 'has no step in progress'))
    })
  })

  describe('with several steps of the role in progress', () => {
    it('answers the one started last whatever its place in the plan', () => {
      expect(
        decisionStepOf(planText(running('s1', 'qa', late), running('s2', 'qa', early)), 'qa'),
      ).toEqual(found('s1'))
      expect(
        decisionStepOf(planText(running('s1', 'qa', early), running('s2', 'qa', late)), 'qa'),
      ).toEqual(found('s2'))
    })

    it('compares the instants, not the texts', () => {
      const plan = planText(
        running('s1', 'qa', '2026-01-01T10:00:00Z'),
        running('s2', 'qa', '2026-01-01T10:00:00.500Z'),
      )
      expect(decisionStepOf(plan, 'qa')).toEqual(found('s2'))
    })

    it('answers the first of them in the plan when the starts tie', () => {
      expect(
        decisionStepOf(planText(running('s1', 'qa', early), running('s2', 'qa', early)), 'qa'),
      ).toEqual(found('s1'))
    })

    it.each<[string | null]>([[null], ['yesterday'], ['2026-01-01T10:00:00']])(
      'ranks a start of %s below every instant',
      (start) => {
        expect(
          decisionStepOf(planText(running('s1', 'qa', start), running('s2', 'qa', early)), 'qa'),
        ).toEqual(found('s2'))
        expect(
          decisionStepOf(planText(running('s1', 'qa', early), running('s2', 'qa', start)), 'qa'),
        ).toEqual(found('s1'))
      },
    )

    it('answers the first of them in the plan when no start is an instant', () => {
      expect(
        decisionStepOf(planText(running('s1', 'qa', null), running('s2', 'qa', 'later')), 'qa'),
      ).toEqual(found('s1'))
    })

    it('answers the rework in progress of the role, not its finished step', () => {
      const plan = planText(done('s1', 'dev-a'), running('s1.rework-1', 'dev-a', early))
      expect(decisionStepOf(plan, 'dev-a')).toEqual(found('s1.rework-1'))
    })
  })

  describe('with no step in progress', () => {
    it.each<[string, unknown]>([
      ['a role', 'dev-a'],
      ['a missing role', undefined],
    ])('refuses on the step field for %s', (_name, role) => {
      const plan = planText(step('s1'), done('s2', 'dev-a'))
      expect(decisionStepOf(plan, role)).toEqual(refusal('step', 'no step is in progress'))
    })

    it('refuses on a plan with no step', () => {
      expect(decisionStepOf(planText(), 'dev-a')).toEqual(
        refusal('step', 'no step is in progress'),
      )
    })
  })

  describe('with a plan that breaks the contract', () => {
    it('answers the plan errors for text that is not JSON', () => {
      expect(decisionStepOf('{"issue":', 'dev-a')).toEqual({
        accepted: false,
        errors: [{ file: 'plan.json', location: null, field: null, message: 'is not valid JSON' }],
      })
    })

    it('answers the plan errors for a step the schema refuses', () => {
      const plan = planText(running('s1', 'dev-a', early), { ...step('s2'), status: 'paused' })
      const result = decisionStepOf(plan, 'dev-a')
      expect(result).toMatchObject({ accepted: false, errors: [{ file: 'plan.json', location: 's2' }] })
    })

    it('refuses a plan with duplicate step ids even when one step is in progress', () => {
      const plan = planText(running('s1', 'dev-a', early), step('s1'))
      expect(decisionStepOf(plan, 'dev-a')).toMatchObject({
        accepted: false,
        errors: [{ file: 'plan.json', field: 'id', message: 'must be unique' }],
      })
    })
  })
})
