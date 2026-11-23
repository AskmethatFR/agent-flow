import { describe, expect, it } from 'vitest'
import { buildSnapshot, factEntriesOf } from './index'
import { readMutationReport } from './mutation-report'
import { readTestReport } from './test-report'

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

const strykerLine = (detected: number, surviving: number): string =>
  JSON.stringify({
    at: '2026-11-23T12:00:00.000Z',
    tool: 'stryker',
    step: 's1',
    attachment: 'role',
    role: 'dev-a',
    roleFrom: 'agent',
    detected,
    surviving,
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

  it.each([
    ['unreadable', 'cannot be read'],
    ['too-large', 'exceeds 1048576 characters'],
  ] as const)('gives one verified-facts.jsonl error and no entry for a %s file', (unavailable, message) => {
    expect(factEntriesOf({ unavailable })).toEqual({
      entries: [],
      errors: [{ file: 'verified-facts.jsonl', location: null, field: null, message }],
    })
  })

  it('keeps the contract error of a malformed line next to the entries of the valid ones', () => {
    const valid = factLine()
    expect(factEntriesOf(`not json\n${valid}\n`)).toEqual({
      entries: [{ step: 's1', text: valid }],
      errors: [{ file: 'verified-facts.jsonl', location: 1, field: null, message: 'is not valid JSON' }],
    })
  })
})

describe('the fact of an entry against the fact of its report', () => {
  const range = (length: number): number[] => Array.from({ length }, (_, index) => index)

  const vitestReport = (total: number, passed: number, failedSuites: number): string =>
    JSON.stringify({ numTotalTests: total, numPassedTests: passed, numFailedTestSuites: failedSuites })

  const cucumberReport = (passed: number, total: number): string =>
    JSON.stringify([
      {
        elements: range(total).map((index) => ({
          steps: [{ result: { status: index < passed ? 'passed' : 'failed' } }],
        })),
      },
    ])

  const strykerReport = (detected: number, surviving: number): string =>
    JSON.stringify({
      schemaVersion: '1.0',
      files: {
        'src/a.ts': {
          mutants: [
            ...range(detected).map(() => ({ status: 'Killed' })),
            ...range(surviving).map(() => ({ status: 'Survived' })),
          ],
        },
      },
    })

  // The line the capture writer makes: the counts core's own readers extract, plus the attachment fields.
  const lineOfReport = (kind: 'test' | 'mutation', text: string): string => {
    const result = kind === 'test' ? readTestReport(text) : readMutationReport(text)
    if (!result.accepted) throw new Error(`the report was refused: ${result.message}`)
    const { source, ...counts } = result.report
    return factLine({ tool: source, passed: undefined, total: undefined, failedSuites: undefined, ...counts })
  }

  const reports: { name: string; kind: 'test' | 'mutation'; text: string }[] = [
    ...range(6).flatMap((total) =>
      range(total + 1).flatMap((passed) =>
        range(3).map((failedSuites) => ({
          name: `vitest ${passed} of ${total}, ${failedSuites} failed suites`,
          kind: 'test' as const,
          text: vitestReport(total, passed, failedSuites),
        })),
      ),
    ),
    ...range(5).flatMap((total) =>
      range(total + 1).map((passed) => ({
        name: `cucumber-js ${passed} of ${total}`,
        kind: 'test' as const,
        text: cucumberReport(passed, total),
      })),
    ),
    ...range(12).flatMap((detected) =>
      range(12)
        .filter((surviving) => detected + surviving > 0)
        .map((surviving) => ({
          name: `stryker ${detected} detected, ${surviving} surviving`,
          kind: 'mutation' as const,
          text: strykerReport(detected, surviving),
        })),
    ),
  ]

  it('gives the entry of a line the fact its report gives, over every report of the grid', () => {
    const mismatches = reports.flatMap(({ name, kind, text }) => {
      const fromReport = buildSnapshot(
        { plan: planOf('s1'), [kind === 'test' ? 'testReports' : 'mutationReports']: [{ step: 's1', text }] },
        now,
      )
      const { entries, errors } = factEntriesOf(`${lineOfReport(kind, text)}\n`)
      const fromLine = factsOf(entries, 's1')
      const same =
        fromReport.steps[0]?.facts.length === 1 &&
        errors.length === 0 &&
        fromLine.errors.length === 0 &&
        JSON.stringify(fromLine.steps[0]?.facts) === JSON.stringify(fromReport.steps[0]?.facts)
      return same ? [] : [name]
    })
    expect(reports).toHaveLength(63 + 15 + 143)
    expect(mismatches).toEqual([])
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

  it('accepts a valid line followed by a trailing newline', () => {
    const snapshot = factsOf([{ step: 's1', text: `${factLine()}\n` }], 's1')
    expect(snapshot.steps[0]?.facts).toEqual([
      { origin: 'verified', source: 'vitest', label: '5 of 5 passed' },
    ])
    expect(snapshot.errors).toEqual([])
  })

  it('gives a stryker line the fact of its mutation score', () => {
    const snapshot = factsOf([{ step: 's1', text: strykerLine(9, 2) }], 's1')
    expect(snapshot.steps[0]?.facts).toEqual([
      { origin: 'verified', source: 'stryker', label: '81.81% mutation score, 2 surviving' },
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
    ['a valid line then a line that is not JSON', `${factLine()}\nnot json`],
    ['a stryker line with no mutant', strykerLine(0, 0)],
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

  it('puts the verified-facts.jsonl errors after those of mutation-report and before verified-fact, ci-status and agent-state', () => {
    const snapshot = buildSnapshot(
      {
        plan: planOf('s1'),
        verifiedFacts: {
          entries: [{ step: 'ghost', text: factLine() }],
          errors: [{ file: 'verified-facts.jsonl', location: null, field: null, message: 'cannot be read' }],
        },
        mutationReports: [{ step: 'ghost', text: '{}' }],
        ciStatus: 'not json',
      },
      now,
      { unavailable: 'host-error' },
    )
    expect(snapshot.errors.map((error) => error.file)).toEqual([
      'mutation-report',
      'verified-facts.jsonl',
      'verified-fact',
      'ci-status',
      'agent-state',
    ])
  })

  it('keeps the steps and the other facts when the fact file cannot be read', () => {
    const snapshot = buildSnapshot(
      {
        plan: planOf('s1'),
        testReports: [
          {
            step: 's1',
            text: JSON.stringify({ numTotalTests: 2, numPassedTests: 2, numFailedTestSuites: 0 }),
          },
        ],
        verifiedFacts: factEntriesOf({ unavailable: 'unreadable' }),
      },
      now,
    )
    expect(snapshot.steps.map((step) => step.facts.map((fact) => fact.label))).toEqual([['2 of 2 passed']])
    expect(snapshot.errors).toEqual([
      { file: 'verified-facts.jsonl', location: null, field: null, message: 'cannot be read' },
    ])
  })

  it('gives a malformed line its error while the lines around it still give facts', () => {
    const file = `${factLine({ passed: 1, total: 1 })}\nnot json\n${factLine({ passed: 3, total: 3 })}\n`
    const snapshot = buildSnapshot({ plan: planOf('s1'), verifiedFacts: factEntriesOf(file) }, now)
    expect(snapshot.steps[0]?.facts.map((fact) => fact.label)).toEqual(['1 of 1 passed', '3 of 3 passed'])
    expect(snapshot.errors).toEqual([
      { file: 'verified-facts.jsonl', location: 2, field: null, message: 'is not valid JSON' },
    ])
  })

  it('reads the last 200 entries and adds one bound error for 201', () => {
    const file = Array.from({ length: 201 }, (_, index) => factLine({ passed: index, total: 300 })).join('\n')
    const snapshot = buildSnapshot({ plan: planOf('s1'), verifiedFacts: factEntriesOf(file) }, now)
    const labels = snapshot.steps[0]?.facts.map((fact) => fact.label)
    expect(labels).toHaveLength(50)
    expect(labels?.at(-1)).toBe('200 of 300 passed')
    expect(snapshot.steps[0]?.omittedFacts).toBe(150)
    expect(snapshot.errors).toEqual([
      {
        file: 'verified-fact',
        location: null,
        field: null,
        message: 'too many reports, only the last 200 are read',
      },
    ])
  })

  it('adds no fact-file error when the plan is unusable', () => {
    const snapshot = buildSnapshot({ plan: 'not json', verifiedFacts: factEntriesOf({ unavailable: 'unreadable' }) }, now)
    expect(snapshot.steps).toEqual([])
    expect(snapshot.errors.map((error) => error.file)).toEqual(['plan.json'])
  })

  it.each([
    ['an unattached line', unattachedLine()],
    ['a line of another step', factLine({ step: 's2' })],
  ])('refuses an entry of s1 whose text is %s', (_name, text) => {
    const snapshot = factsOf([{ step: 's1', text }], 's1', 's2')
    expect(snapshot.steps.map((step) => step.facts)).toEqual([[], []])
    expect(snapshot.errors).toEqual([
      { file: 'verified-fact', location: 1, field: null, message: 'is not a verified-facts.jsonl line' },
    ])
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
