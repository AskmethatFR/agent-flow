import { describe, expect, it } from 'vitest'
import { buildSnapshot, factEntriesOf } from './index'

const now = new Date('2026-11-23T12:00:00Z')

const planOf = (...ids: string[]): string =>
  JSON.stringify({
    issue: '#112',
    title: 'Verified facts',
    steps: ids.map((id) => ({
      id,
      title: 'Build',
      role: 'dev-a',
      status: 'todo',
      origin: 'planned',
      startedAt: null,
      endedAt: null,
    })),
  })

const factLine = (overlay: Record<string, unknown> = {}): string =>
  JSON.stringify({
    at: '2026-11-23T12:00:00.000Z',
    tool: 'vitest',
    step: 's1',
    attachment: 'role',
    role: 'dev-a',
    roleFrom: 'agent',
    passed: 5,
    total: 5,
    failedSuites: 0,
    ...overlay,
  })

const unattachedLine = (): string =>
  factLine({ step: null, attachment: 'unattached', role: null, roleFrom: null })

const factsOf = (verifiedFacts: readonly { step: string; text: string }[], ...ids: string[]) =>
  buildSnapshot({ plan: planOf(...ids), verifiedFacts: { entries: verifiedFacts, errors: [] } }, now)

describe('factEntriesOf', () => {
  it('keeps the attached lines as step and text, in file order', () => {
    const first = factLine()
    const second = factLine({ step: 's2', tool: 'cucumber-js' })
    const file = `${first}\n${unattachedLine()}\n${second}\n`
    expect(factEntriesOf(file)).toEqual({
      entries: [
        { step: 's1', text: first },
        { step: 's2', text: second },
      ],
      errors: [],
    })
  })

  it('gives no entry and no error for a missing file', () => {
    expect(factEntriesOf({ unavailable: 'missing' })).toEqual({ entries: [], errors: [] })
  })

  it('keeps the contract error of a malformed line next to the entries of the valid ones', () => {
    const valid = factLine()
    expect(factEntriesOf(`not json\n${valid}\n`)).toEqual({
      entries: [{ step: 's1', text: valid }],
      errors: [{ file: 'verified-facts.jsonl', location: 1, field: null, message: 'is not valid JSON' }],
    })
  })
})

describe('buildSnapshot verified-facts entries', () => {
  it('gives a step the fact of its vitest line', () => {
    const snapshot = factsOf([{ step: 's1', text: factLine() }], 's1')
    expect(snapshot.steps[0]?.facts).toEqual([
      { origin: 'verified', source: 'vitest', label: '5 of 5 passed' },
    ])
    expect(snapshot.errors).toEqual([])
  })

  it('gives a cucumber-js line the source cucumber-js', () => {
    const text = factLine({ tool: 'cucumber-js', passed: 3, total: 4 })
    const snapshot = factsOf([{ step: 's1', text }], 's1')
    expect(snapshot.steps[0]?.facts).toEqual([
      { origin: 'verified', source: 'cucumber-js', label: '3 of 4 passed' },
    ])
  })

  it('marks a run that passed every test but failed a suite', () => {
    const text = factLine({ failedSuites: 2 })
    const snapshot = factsOf([{ step: 's1', text }], 's1')
    expect(snapshot.steps[0]?.facts[0]?.label).toBe('5 of 5 passed, run failed')
  })

  it('gives no entry and no error for an unattached line', () => {
    const { entries, errors } = factEntriesOf(`${unattachedLine()}\n`)
    const snapshot = factsOf(entries, 's1')
    expect(snapshot.steps[0]?.facts).toEqual([])
    expect([...errors, ...snapshot.errors]).toEqual([])
  })

  it('gives no entry and no error for a missing file', () => {
    const { entries } = factEntriesOf({ unavailable: 'missing' })
    const snapshot = factsOf(entries, 's1')
    expect(snapshot.steps[0]?.facts).toEqual([])
    expect(snapshot.errors).toEqual([])
  })

  it('gives each step the fact of its own line', () => {
    const { entries } = factEntriesOf(`${factLine()}\n${factLine({ step: 's2', passed: 1, total: 2 })}\n`)
    const snapshot = factsOf(entries, 's1', 's2')
    expect(snapshot.steps.map((step) => step.facts.map((fact) => fact.label))).toEqual([
      ['5 of 5 passed'],
      ['1 of 2 passed'],
    ])
  })

  it.each([
    ['text that is not JSON', 'not a line'],
    ['an empty text', ''],
    ['a JSON text that is not a fact', '{"tool":"vitest"}'],
    ['two valid lines', `${factLine()}\n${factLine()}`],
  ])('refuses %s without throwing', (_name, text) => {
    const snapshot = factsOf([{ step: 's1', text }], 's1')
    expect(snapshot.steps[0]?.facts).toEqual([])
    expect(snapshot.errors).toEqual([
      { file: 'verified-fact', location: 1, field: null, message: 'is not a verified-facts.jsonl line' },
    ])
  })

  it('numbers an error by the position of its entry, from 1', () => {
    const snapshot = factsOf(
      [
        { step: 's1', text: factLine() },
        { step: 's1', text: 'not a line' },
      ],
      's1',
    )
    expect(snapshot.errors).toEqual([
      { file: 'verified-fact', location: 2, field: null, message: 'is not a verified-facts.jsonl line' },
    ])
  })

  it('reports an entry whose step is not in the plan without echoing the id', () => {
    const snapshot = factsOf([{ step: 'ghost', text: factLine({ step: 'ghost' }) }], 's1')
    expect(snapshot.steps[0]?.facts).toEqual([])
    expect(snapshot.errors).toEqual([
      { file: 'verified-fact', location: 1, field: 'step', message: 'is not a step of plan.json' },
    ])
  })

  it('puts the verified-fact errors after those of verified-facts.jsonl and before CI', () => {
    const snapshot = buildSnapshot(
      {
        plan: planOf('s1'),
        verifiedFacts: { entries: [{ step: 'ghost', text: factLine() }], errors: [] },
        mutationReports: [{ step: 'ghost', text: '{}' }],
        ciStatus: 'not json',
      },
      now,
    )
    expect(snapshot.errors.map((error) => error.file)).toEqual(['mutation-report', 'verified-fact', 'ci-status'])
  })

  it('lists the facts of a step as declared, test, mutation, then file entries', () => {
    const snapshot = buildSnapshot(
      {
        plan: planOf('s1'),
        testReports: [
          {
            step: 's1',
            text: JSON.stringify({ numTotalTests: 2, numPassedTests: 2, numFailedTestSuites: 0 }),
          },
        ],
        verifiedFacts: { entries: [{ step: 's1', text: factLine() }], errors: [] },
      },
      now,
    )
    expect(snapshot.steps[0]?.facts.map((fact) => fact.label)).toEqual(['2 of 2 passed', '5 of 5 passed'])
  })
})
