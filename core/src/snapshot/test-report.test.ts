import { describe, expect, it } from 'vitest'
import { readTestReport } from './test-report'

const vitestText = (counts: Record<string, unknown>): string => JSON.stringify(counts)

const unknownShape = { accepted: false, message: 'is not a vitest or cucumber-js JSON report' }

describe('readTestReport on text that is not a usable report', () => {
  it.each([
    ['an empty text', ''],
    ['a truncated document', '{"numTotalTests": 5'],
    ['plain prose', 'not json'],
  ])('refuses %s as invalid JSON', (_, text) => {
    expect(readTestReport(text)).toEqual({ accepted: false, message: 'is not valid JSON' })
  })

  it.each([
    ['null', 'null'],
    ['a number', '5'],
    ['a string', '"vitest"'],
    ['a boolean', 'true'],
    ['an array holding null', '[null]'],
    ['an array holding an array', '[[]]'],
    ['deeply nested arrays', `${'['.repeat(500)}${']'.repeat(500)}`],
    ['an array of features without elements', '[{}]'],
  ])('refuses %s as an unknown shape without throwing', (_, text) => {
    expect(readTestReport(text)).toEqual(unknownShape)
  })

  it('refuses a text of one character over the bound before parsing it', () => {
    const body = vitestText({ numTotalTests: 5, numPassedTests: 5 })
    const text = `${body}${' '.repeat(1_048_577 - body.length)}`
    expect(text).toHaveLength(1_048_577)
    expect(readTestReport(text)).toEqual({ accepted: false, message: 'exceeds 1048576 characters' })
  })

  it('accepts a text of exactly the bound', () => {
    const body = vitestText({ numTotalTests: 5, numPassedTests: 5 })
    const text = `${body}${' '.repeat(1_048_576 - body.length)}`
    expect(text).toHaveLength(1_048_576)
    expect(readTestReport(text)).toEqual({ accepted: true, report: { source: 'vitest', passed: 5, total: 5 } })
  })
})

describe('readTestReport on a vitest report', () => {
  it.each([
    [5, 5],
    [5, 3],
    [5, 0],
    [0, 0],
    [1, 1],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  ])('accepts %i tests of which %i passed, as reported', (total, passed) => {
    const text = vitestText({ numTotalTests: total, numPassedTests: passed })
    expect(readTestReport(text)).toEqual({ accepted: true, report: { source: 'vitest', passed, total } })
  })

  it.each([
    ['one more passed than total', { numTotalTests: 5, numPassedTests: 6 }],
    ['a negative total', { numTotalTests: -1, numPassedTests: 0 }],
    ['a negative passed count', { numTotalTests: 5, numPassedTests: -1 }],
    ['a fractional total', { numTotalTests: 2.5, numPassedTests: 2 }],
    ['a fractional passed count', { numTotalTests: 5, numPassedTests: 2.5 }],
    ['an unsafe integer total', { numTotalTests: 2 ** 53, numPassedTests: 0 }],
    ['a string total', { numTotalTests: '5', numPassedTests: 5 }],
    ['a string passed count', { numTotalTests: 5, numPassedTests: '5' }],
    ['a missing total', { numPassedTests: 5 }],
    ['a missing passed count', { numTotalTests: 5 }],
    ['an empty object', {}],
  ])('refuses %s as an unknown shape', (_, counts) => {
    expect(readTestReport(vitestText(counts))).toEqual(unknownShape)
  })
})

const scenario = (...statuses: unknown[]): Record<string, unknown> => ({
  type: 'scenario',
  steps: statuses.map((status) => ({ result: { status } })),
})

const feature = (...elements: unknown[]): Record<string, unknown> => ({ keyword: 'Feature', elements })

const cucumberText = (...features: unknown[]): string => JSON.stringify(features)

const cucumberReport = (passed: number, total: number) => ({
  accepted: true,
  report: { source: 'cucumber-js', passed, total },
})

describe('readTestReport on a cucumber-js JSON report', () => {
  it('counts a scenario as passed when every one of its steps passed', () => {
    const text = cucumberText(feature(scenario('passed', 'passed'), scenario('passed')))
    expect(readTestReport(text)).toEqual(cucumberReport(2, 2))
  })

  it.each([
    ['failed', 'failed'],
    ['skipped', 'skipped'],
    ['pending', 'pending'],
    ['undefined', 'undefined'],
    ['ambiguous', 'ambiguous'],
    ['unknown', 'unknown'],
  ])('does not count a scenario with one %s step as passed', (_, status) => {
    const text = cucumberText(feature(scenario('passed', status, 'passed'), scenario('passed')))
    expect(readTestReport(text)).toEqual(cucumberReport(1, 2))
  })

  it('does not count a scenario whose last step failed, hidden hooks included', () => {
    const hook = { hidden: true, keyword: 'After', result: { status: 'failed' } }
    const text = cucumberText(feature({ type: 'scenario', steps: [{ result: { status: 'passed' } }, hook] }))
    expect(readTestReport(text)).toEqual(cucumberReport(0, 1))
  })

  it('counts a scenario with no step as passed', () => {
    expect(readTestReport(cucumberText(feature(scenario())))).toEqual(cucumberReport(1, 1))
  })

  it('sums the scenarios of every feature', () => {
    const text = cucumberText(feature(scenario('passed'), scenario('failed')), feature(scenario('passed')), feature())
    expect(readTestReport(text)).toEqual(cucumberReport(2, 3))
  })

  it.each([
    ['no feature', '[]'],
    ['a feature with no scenario', cucumberText(feature())],
  ])('reports 0 of 0 for %s', (_, text) => {
    expect(readTestReport(text)).toEqual(cucumberReport(0, 0))
  })

  it.each([
    ['a null feature', cucumberText(null)],
    ['a feature whose elements is not an array', cucumberText({ elements: {} })],
    ['a null scenario', cucumberText(feature(null))],
    ['a scenario whose steps is not an array', cucumberText(feature({ steps: 'passed' }))],
    ['a null step', cucumberText(feature({ steps: [null] }))],
    ['a step with no result', cucumberText(feature({ steps: [{}] }))],
    ['a step whose result is null', cucumberText(feature({ steps: [{ result: null }] }))],
    ['a step with no status', cucumberText(feature({ steps: [{ result: {} }] }))],
    ['a step whose status is not a string', cucumberText(feature(scenario(1)))],
    ['one bad scenario after good ones', cucumberText(feature(scenario('passed'), null))],
    ['one bad feature after good ones', cucumberText(feature(scenario('passed')), null)],
  ])('refuses the whole report for %s', (_, text) => {
    expect(readTestReport(text)).toEqual(unknownShape)
  })
})
