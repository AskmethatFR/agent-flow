import { describe, expect, it } from 'vitest'
import { MAX_ERRORS } from './contract-error'
import { readJsonl } from './jsonl'
import type { JsonlContract } from './jsonl'
import type { SchemaViolation } from './schema-subset'

const mustBeOk = (record: unknown): SchemaViolation | undefined =>
  (record as { ok: boolean }).ok ? undefined : { path: ['ok'], message: 'must be true' }

const contractWith = (overlay: Partial<JsonlContract> = {}): JsonlContract => ({
  file: 'sample.jsonl',
  schema: {
    type: 'object',
    required: ['id', 'ok'],
    additionalProperties: false,
    properties: { id: { type: 'string' }, ok: { type: 'boolean' } },
  },
  minimumRecordLength: 20,
  recordRule: mustBeOk,
  ...overlay,
})

const good = (id: string): string => JSON.stringify({ id, ok: true })
const bad = (id: string): string => JSON.stringify({ id, ok: false })

const ruleError = (location: number) => ({
  file: 'sample.jsonl',
  location,
  field: 'ok',
  message: 'must be true',
})

describe('readJsonl with a recordRule', () => {
  it('reports a rule violation with its line number and field and keeps the other records', () => {
    const result = readJsonl(contractWith(), [good('a'), bad('b'), good('c')].join('\n'))
    expect(result.errors).toEqual([ruleError(2)])
    expect(result.records).toEqual([
      { record: { id: 'a', ok: true }, location: 1 },
      { record: { id: 'c', ok: true }, location: 3 },
    ])
  })

  it('keeps line order between JSON, schema and rule errors', () => {
    const text = [bad('a'), '{not json', JSON.stringify({ ok: false }), bad('d')].join('\n')
    expect(readJsonl(contractWith(), text).errors).toEqual([
      ruleError(1),
      { file: 'sample.jsonl', location: 2, field: null, message: 'is not valid JSON' },
      { file: 'sample.jsonl', location: 3, field: 'id', message: 'is required' },
      ruleError(4),
    ])
  })

  it('runs the rule after the schema, so a schema violation wins on the same line', () => {
    const result = readJsonl(contractWith(), JSON.stringify({ ok: false }))
    expect(result.errors).toEqual([
      { file: 'sample.jsonl', location: 1, field: 'id', message: 'is required' },
    ])
  })

  it('runs the rule before uniqueKey, so a rule violation wins and does not claim the key', () => {
    const text = [bad('a'), bad('a'), good('a'), good('a')].join('\n')
    const result = readJsonl(contractWith({ uniqueKey: 'id' }), text)
    expect(result.errors).toEqual([
      ruleError(1),
      ruleError(2),
      { file: 'sample.jsonl', location: 4, field: 'id', message: 'must be unique' },
    ])
    expect(result.records).toEqual([{ record: { id: 'a', ok: true }, location: 3 }])
  })

  it('labels an unsafe rule field as null', () => {
    const rule = (): SchemaViolation => ({ path: ['not a safe label'], message: 'is wrong' })
    const result = readJsonl(contractWith({ recordRule: rule }), good('a'))
    expect(result.errors).toEqual([
      { file: 'sample.jsonl', location: 1, field: null, message: 'is wrong' },
    ])
  })

  it('caps rule errors like any other error', () => {
    const text = Array.from({ length: MAX_ERRORS + 20 }, (_, index) => bad(`id${index}`)).join('\n')
    const { errors } = readJsonl(contractWith(), text)
    expect(errors).toHaveLength(MAX_ERRORS + 1)
    expect(errors[MAX_ERRORS - 1]).toEqual(ruleError(MAX_ERRORS))
    expect(errors[MAX_ERRORS]).toEqual({
      file: 'sample.jsonl',
      location: null,
      field: null,
      message: `too many errors, only the first ${MAX_ERRORS} are shown`,
    })
  })

  it('still applies the rule past the cap to lines as long as the shortest valid one, and skips shorter ones', () => {
    const seen: string[] = []
    const rule = (record: unknown): SchemaViolation | undefined => {
      seen.push((record as { id: string }).id)
      return mustBeOk(record)
    }
    const flood = Array.from({ length: MAX_ERRORS + 1 }, (_, index) => bad(`f${index}`))
    const contract = contractWith({ recordRule: rule, minimumRecordLength: good('aaaa').length })
    const text = [...flood, good('aaaa'), good('a')].join('\n')
    const { records } = readJsonl(contract, text)
    expect(seen).toContain('aaaa')
    expect(seen).not.toContain('a')
    expect(records).toEqual([{ record: { id: 'aaaa', ok: true }, location: MAX_ERRORS + 2 }])
  })
})
