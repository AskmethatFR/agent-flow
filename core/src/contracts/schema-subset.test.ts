import { describe, expect, it } from 'vitest'
import { findViolations } from './schema-subset'
import type { JsonSchema } from './schema-subset'

describe('findViolations', () => {
  it.each([
    ['pattern', { pattern: '^a$' }],
    ['format', { type: 'string', format: 'date-time' }],
    ['$ref', { $ref: '#/$defs/step' }],
    ['minItems', { type: 'array', minItems: 1 }],
    ['constructor', { constructor: 'x' }],
  ])('refuses the unsupported keyword %s', (keyword, schema) => {
    expect(() => findViolations(schema as JsonSchema, 'value')).toThrow(
      `unsupported schema keyword: ${keyword}`,
    )
  })

  it.each([
    ['properties', { properties: { a: { pattern: 'x' } } }],
    ['items', { items: { pattern: 'x' } }],
  ])('refuses an unsupported keyword nested under %s even when no value reaches it', (_, schema) => {
    expect(() => findViolations(schema as JsonSchema, {})).toThrow(
      'unsupported schema keyword: pattern',
    )
  })

  it.each(['integer', 'constructor', '__proto__'])('refuses the unsupported type %s', (type) => {
    expect(() => findViolations({ type }, 'value')).toThrow(`unsupported schema type: ${type}`)
  })

  it.each([true, 'x'])('refuses additionalProperties set to %j', (additionalProperties) => {
    const schema = { type: 'object', additionalProperties } as unknown as JsonSchema
    expect(() => findViolations(schema, {})).toThrow('unsupported additionalProperties')
  })

  it.each([
    ['a node without a type', {}, 7],
    ['an object node without required', { type: 'object' }, { any: 1 }],
    ['an object node that leaves additionalProperties open', { type: 'object' }, { extra: 1 }],
    ['an array node without items', { type: 'array' }, [1]],
    ['an items node reached by a non-array value', { items: { type: 'string' } }, 7],
  ])('accepts %s', (_, schema, value) => {
    expect(findViolations(schema as JsonSchema, value)).toEqual([])
  })

  it.each(['$schema', '$id', 'title', 'description'])('ignores the annotation %s', (keyword) => {
    expect(findViolations({ [keyword]: 'text', type: 'string' } as JsonSchema, 'value')).toEqual([])
  })
})
