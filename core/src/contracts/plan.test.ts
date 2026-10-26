import { describe, expect, it } from 'vitest'
import planSchema from '../../../schemas/plan.schema.json' with { type: 'json' }
import { validatePlan } from './index'

const validStep = {
  id: 's4',
  title: 'Implementation',
  role: 'dev-a',
  status: 'in_progress',
  origin: 'planned',
  startedAt: '2026-10-22T10:31:00Z',
  endedAt: null,
}

const validPlan = { issue: '#142', title: 'Magic link authentication', steps: [validStep] }

const planText = (step: Record<string, unknown>): string =>
  JSON.stringify({ ...validPlan, steps: [step] })

const rejection = (location: string | number | null, field: string | null, message: string) => ({
  accepted: false,
  errors: [{ file: 'plan.json', location, field, message }],
})

describe('validatePlan', () => {
  it('declares the schema version in its $id', () => {
    expect(planSchema.$id).toBe('urn:agent-flow:schema:plan:1')
  })

  it.each([
    ['status', 'todo'],
    ['status', 'in_progress'],
    ['status', 'done'],
    ['origin', 'planned'],
    ['origin', 'proposed'],
    ['startedAt', null],
    ['startedAt', '2026-10-22T10:31:00Z'],
    ['endedAt', null],
    ['endedAt', '2026-10-22T12:00:00Z'],
  ])('accepts a step whose %s is %j', (field, value) => {
    expect(validatePlan(planText({ ...validStep, [field]: value }))).toEqual({ accepted: true })
  })

  it.each([[[]], [[validStep, { ...validStep, id: 's5' }]]])('accepts steps %j', (steps) => {
    expect(validatePlan(JSON.stringify({ ...validPlan, steps }))).toEqual({ accepted: true })
  })

  it.each([
    ['status', 'paused', 'must be one of todo, in_progress, done'],
    ['origin', 'draft', 'must be one of planned, proposed'],
  ])('rejects a step whose %s is outside its enum (%s)', (field, value, message) => {
    expect(validatePlan(planText({ ...validStep, [field]: value }))).toEqual(
      rejection('s4', field, message),
    )
  })

  it.each(['issue', 'title', 'steps'])('rejects a plan missing its %s', (key) => {
    const { [key]: _removed, ...plan } = validPlan as Record<string, unknown>
    expect(validatePlan(JSON.stringify(plan))).toEqual(rejection(null, key, 'is required'))
  })

  it.each(['title', 'role', 'status', 'origin', 'startedAt', 'endedAt'])(
    'rejects a step missing its %s',
    (key) => {
      const { [key]: _removed, ...step } = validStep as Record<string, unknown>
      expect(validatePlan(planText(step))).toEqual(rejection('s4', key, 'is required'))
    },
  )

  it.each(['extra', 'constructor', '__proto__'])('rejects an undeclared %s on a step', (key) => {
    const step = JSON.parse(JSON.stringify(validStep))
    Object.defineProperty(step, key, { value: 1, enumerable: true })
    expect(validatePlan(planText(step))).toEqual(rejection('s4', key, 'is not allowed'))
  })

  it.each(['extra', 'constructor', '__proto__'])('rejects an undeclared %s on the plan', (key) => {
    const plan = JSON.parse(JSON.stringify(validPlan))
    Object.defineProperty(plan, key, { value: 1, enumerable: true })
    expect(validatePlan(JSON.stringify(plan))).toEqual(rejection(null, key, 'is not allowed'))
  })

  it.each([
    ['title', 'must be string'],
    ['role', 'must be string'],
    ['status', 'must be string'],
    ['origin', 'must be string'],
    ['startedAt', 'must be string or null'],
    ['endedAt', 'must be string or null'],
  ])('rejects a step whose %s has the wrong type', (field, message) => {
    expect(validatePlan(planText({ ...validStep, [field]: 7 }))).toEqual(
      rejection('s4', field, message),
    )
  })

  it.each(['issue', 'title'])('rejects a plan whose %s is not a string', (key) => {
    expect(validatePlan(JSON.stringify({ ...validPlan, [key]: 7 }))).toEqual(
      rejection(null, key, 'must be string'),
    )
  })

  it('rejects a plan whose steps is not an array', () => {
    expect(validatePlan(JSON.stringify({ ...validPlan, steps: {} }))).toEqual(
      rejection(null, 'steps', 'must be array'),
    )
  })

  it.each([7, null, 'text', [], true])('rejects a step that is not an object (%j)', (step) => {
    expect(validatePlan(JSON.stringify({ ...validPlan, steps: [step] }))).toEqual(
      rejection('steps[0]', null, 'must be object'),
    )
  })

  it.each(['7', 'null', '"text"', '[]', 'true'])('rejects a document that is %s', (text) => {
    expect(validatePlan(text)).toEqual(rejection(null, null, 'must be object'))
  })

  it.each(['', '{', 'not json'])('rejects text that is not JSON (%j)', (text) => {
    expect(validatePlan(text)).toEqual(rejection(null, null, 'is not valid JSON'))
  })

  it('locates a step whose id is not a string by position', () => {
    expect(validatePlan(planText({ ...validStep, id: 7 }))).toEqual(
      rejection('steps[0]', 'id', 'must be string'),
    )
  })

  it('rejects an empty step id and locates the step by position', () => {
    expect(validatePlan(planText({ ...validStep, id: '' }))).toEqual(
      rejection('steps[0]', 'id', 'length must be at least 1'),
    )
  })

  const stepsText = (...ids: string[]): string =>
    JSON.stringify({ ...validPlan, steps: ids.map((id) => ({ ...validStep, id })) })

  const duplicate = (location: string) => ({
    file: 'plan.json',
    location,
    field: 'id',
    message: 'must be unique',
  })

  it.each([
    ['one repeat', ['s4', 's4'], ['s4']],
    ['a triple', ['s4', 's4', 's4'], ['s4', 's4']],
    ['repeats in document order', ['a', 'b', 'a', 'b'], ['a', 'b']],
    ['an unsafe repeated id located by position', ['a b', 'a b'], ['steps[1]']],
  ])('rejects duplicate step ids: %s', (_, ids, locations) => {
    expect(validatePlan(stepsText(...ids))).toEqual({
      accepted: false,
      errors: locations.map(duplicate),
    })
  })

  it('accepts distinct step ids', () => {
    expect(validatePlan(stepsText('s4', 's5'))).toEqual({ accepted: true })
  })

  it('reports schema violations instead of duplicates when both exist', () => {
    const text = JSON.stringify({
      ...validPlan,
      steps: [validStep, { ...validStep, status: 'paused' }],
    })
    expect(validatePlan(text)).toEqual(
      rejection('s4', 'status', 'must be one of todo, in_progress, done'),
    )
  })

  const paddedTo = (length: number): string => {
    const text = JSON.stringify(validPlan)
    return text + ' '.repeat(length - text.length)
  }

  it('accepts a document of exactly 1048576 characters', () => {
    expect(validatePlan(paddedTo(1_048_576))).toEqual({ accepted: true })
  })

  it.each([paddedTo(1_048_577), 'x'.repeat(1_048_577)])(
    'rejects a document of 1048577 characters with the single ceiling error without parsing it',
    (text) => {
      expect(validatePlan(text)).toEqual(rejection(null, null, 'exceeds 1048576 characters'))
    },
  )

  const manyBadSteps = (count: number): string =>
    JSON.stringify({
      ...validPlan,
      steps: Array.from({ length: count }, (_, index) => ({
        ...validStep,
        id: `s${index}`,
        status: 'paused',
      })),
    })

  const tooMany = {
    file: 'plan.json',
    location: null,
    field: null,
    message: 'too many errors, only the first 100 are shown',
  }

  it.each([1, 99, 100])('lists all %i errors without a marker', (count) => {
    const result = validatePlan(manyBadSteps(count))
    expect(result.accepted === false && result.errors).toHaveLength(count)
    expect(result.accepted === false && result.errors).not.toContainEqual(tooMany)
  })

  it.each([101, 250])('keeps the first 100 of %i errors and appends one marker', (count) => {
    const result = validatePlan(manyBadSteps(count))
    if (result.accepted) throw new Error('expected a rejection')
    expect(result.errors).toHaveLength(101)
    expect(result.errors[0]?.location).toBe('s0')
    expect(result.errors[99]?.location).toBe('s99')
    expect(result.errors[100]).toEqual(tooMany)
  })

  it.each([
    [101, 100],
    [102, 101],
  ])('caps duplicate-id errors too (%i steps, %i repeats)', (steps, repeats) => {
    const result = validatePlan(stepsText(...Array.from({ length: steps }, () => 's4')))
    if (result.accepted) throw new Error('expected a rejection')
    expect(result.errors).toHaveLength(repeats > 100 ? 101 : repeats)
    expect(result.errors.at(-1)).toEqual(repeats > 100 ? tooMany : duplicate('s4'))
  })

  it('locates a non-string id on the second step by its position', () => {
    const text = JSON.stringify({ ...validPlan, steps: [validStep, { ...validStep, id: 7 }] })
    expect(validatePlan(text)).toEqual(rejection('steps[1]', 'id', 'must be string'))
  })

  it('reports two missing step keys in schema order', () => {
    const { title: _title, role: _role, ...step } = validStep
    expect(validatePlan(planText(step))).toEqual({
      accepted: false,
      errors: [
        { file: 'plan.json', location: 's4', field: 'title', message: 'is required' },
        { file: 'plan.json', location: 's4', field: 'role', message: 'is required' },
      ],
    })
  })

  it.each([['steps[1]'], ['s4\n'], ['a'.repeat(65)], ['a b'], ['x/y']])(
    'locates a step with the unsafe id %j by position',
    (id) => {
      expect(validatePlan(planText({ ...validStep, id, status: 'paused' }))).toEqual(
        rejection('steps[0]', 'status', 'must be one of todo, in_progress, done'),
      )
    },
  )

  it.each([['a'.repeat(64)], ['s-4.a_b:c']])('echoes the safe id %j as the location', (id) => {
    expect(validatePlan(planText({ ...validStep, id, status: 'paused' }))).toEqual(
      rejection(id, 'status', 'must be one of todo, in_progress, done'),
    )
  })

  const unsafeKeys = ['bad\nkey', 'a'.repeat(65), 'a b', 'x[0]']

  it.each(unsafeKeys)('hides the undeclared step key %j', (key) => {
    expect(validatePlan(planText({ ...validStep, [key]: 1 }))).toEqual(
      rejection('s4', null, 'has a field whose name cannot be shown'),
    )
  })

  it.each(unsafeKeys)('hides the undeclared plan key %j', (key) => {
    expect(validatePlan(JSON.stringify({ ...validPlan, [key]: 1 }))).toEqual(
      rejection(null, null, 'has a field whose name cannot be shown'),
    )
  })

  it('locates each error on its own step, in document order', () => {
    const text = JSON.stringify({
      ...validPlan,
      steps: [validStep, { ...validStep, id: 's5', status: 'paused', origin: 'draft' }],
    })
    expect(validatePlan(text)).toEqual({
      accepted: false,
      errors: [
        {
          file: 'plan.json',
          location: 's5',
          field: 'status',
          message: 'must be one of todo, in_progress, done',
        },
        {
          file: 'plan.json',
          location: 's5',
          field: 'origin',
          message: 'must be one of planned, proposed',
        },
      ],
    })
  })

  it('reports missing fields before undeclared ones, then nested violations', () => {
    const text = JSON.stringify({
      issue: '#142',
      extra: 1,
      steps: [{ ...validStep, status: 'paused' }],
    })
    expect(validatePlan(text)).toEqual({
      accepted: false,
      errors: [
        { file: 'plan.json', location: null, field: 'title', message: 'is required' },
        { file: 'plan.json', location: null, field: 'extra', message: 'is not allowed' },
        {
          file: 'plan.json',
          location: 's4',
          field: 'status',
          message: 'must be one of todo, in_progress, done',
        },
      ],
    })
  })

  it('locates a step missing its id by position', () => {
    const { id: _removed, ...step } = validStep
    expect(validatePlan(planText(step))).toEqual(rejection('steps[0]', 'id', 'is required'))
  })
})
