import { describe, expect, it } from 'vitest'
import { findViolations } from './schema-subset'
import type { JsonSchema } from './schema-subset'

describe('findViolations', () => {
  it.each([
    ['maxLength', { maxLength: 3 }],
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
    ['properties', { properties: { a: { maxLength: 3 } } }],
    ['items', { items: { maxLength: 3 } }],
  ])('refuses an unsupported keyword nested under %s even when no value reaches it', (_, schema) => {
    expect(() => findViolations(schema as JsonSchema, {})).toThrow(
      'unsupported schema keyword: maxLength',
    )
  })

  it.each([true, false])('accepts the boolean %s against type boolean', (value) => {
    expect([...findViolations({ type: 'boolean' }, value)]).toEqual([])
  })

  it.each([['"true"', 'true'], ['1', 1], ['0', 0], ['null', null], ['an array', [true]]])(
    'rejects %s against type boolean',
    (_, value) => {
      expect([...findViolations({ type: 'boolean' }, value)]).toEqual([
        { path: [], message: 'must be boolean' },
      ])
    },
  )

  it.each([
    ['a full match', '^a$', 'a', []],
    ['a partial match, since pattern is a search', 'b', 'abc', []],
    ['a non-match', '^a$', 'b', [{ path: [], message: 'must match ^a$' }]],
    ['a value with trailing text past an anchored end', '^a$', 'a\n', [{ path: [], message: 'must match ^a$' }]],
    ['a number, which pattern ignores', '^a$', 7, []],
    ['an astral character matched as one character', '^.$', '\u{1F600}', []],
    ['an empty string against a pattern that needs a character', '^.+$', '', [{ path: [], message: 'must match ^.+$' }]],
  ])('checks pattern on %s', (_, pattern, value, expected) => {
    expect([...findViolations({ pattern }, value)]).toEqual(expected)
  })

  it('reports minLength before pattern when both fail', () => {
    expect([...findViolations({ minLength: 3, pattern: '^b' }, 'a')]).toEqual([
      { path: [], message: 'length must be at least 3' },
    ])
  })

  it('does not constrain a string when no pattern is declared', () => {
    expect([...findViolations({ type: 'string' }, 'anything')]).toEqual([])
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
    expect([...findViolations(schema as JsonSchema, value)]).toEqual([])
  })

  it.each([
    ['exactly at the minimum', 'abc', []],
    ['above the minimum', 'abcd', []],
    ['a number', 7, []],
    ['an array shorter than the minimum', ['a'], []],
    ['one below the minimum', 'ab', [{ path: [], message: 'length must be at least 3' }]],
    ['empty', '', [{ path: [], message: 'length must be at least 3' }]],
    ['three astral characters, exactly at the minimum', '\u{1F600}'.repeat(3), []],
    [
      'two astral characters, one below the minimum',
      '\u{1F600}'.repeat(2),
      [{ path: [], message: 'length must be at least 3' }],
    ],
  ])('checks minLength on a string that is %s', (_, value, expected) => {
    expect([...findViolations({ minLength: 3 }, value)]).toEqual(expected)
  })

  it('walks lazily, so a consumer that stops pulling stops the walk', () => {
    let indexReads = 0
    const items = new Proxy(Array.from({ length: 1000 }, () => 7), {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) indexReads += 1
        return Reflect.get(target, property, receiver)
      },
    })
    const [first] = findViolations({ type: 'array', items: { type: 'string' } }, items)
    expect(first).toEqual({ path: [0], message: 'must be string' })
    expect(indexReads).toBeLessThan(10)
  })

  it.each(['$schema', '$id', 'title', 'description'])('ignores the annotation %s', (keyword) => {
    const schema = { [keyword]: 'text', type: 'string' } as JsonSchema
    expect([...findViolations(schema, 'value')]).toEqual([])
  })
})
