import { describe, expect, it } from 'vitest'
import decisionsSchema from '../../../schemas/decisions.schema.json' with { type: 'json' }
import { readDecisions, serializeDecision, validateDecisions } from './index'

const validDecision = {
  at: '2026-10-22T11:20:00Z',
  step: 's4',
  role: 'dev-a',
  kind: 'decision',
  title: 'Inject TimeProvider to test expiration',
  why: 'Tests token lifetime without real waiting',
  rejected: ['real waits in tests'],
  confidence: 'high',
  model: 'sonnet',
}

const decisionWith = (overlays: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...validDecision,
  ...overlays,
})

const lineText = (value: unknown): string => JSON.stringify(value)

const fileText = (...lines: string[]): string => lines.join('\n')

const decisionText = (decision: Record<string, unknown>): string => lineText(decision)

const rejection = (location: number | null, field: string | null, message: string) => ({
  accepted: false,
  errors: [{ file: 'decisions.jsonl', location, field, message }],
})

const readError = (location: number | null, field: string | null, message: string) => ({
  file: 'decisions.jsonl',
  location,
  field,
  message,
})

const tooManyMarker = readError(null, null, 'too many errors, only the first 100 are shown')

describe('decisions.schema.json', () => {
  it('declares the schema version in its $id', () => {
    expect(decisionsSchema.$id).toBe('urn:agent-flow:schema:decision:1')
  })
})

describe('validateDecisions', () => {
  it.each(['decision', 'step_event', 'question', 'deviation'] as const)(
    'accepts a decision whose kind is %s',
    (kind) => {
      expect(validateDecisions(decisionText({ ...validDecision, kind }))).toEqual({
        accepted: true,
      })
    },
  )

  it.each(['high', 'medium', 'low'] as const)(
    'accepts a decision whose confidence is %s',
    (confidence) => {
      expect(validateDecisions(decisionText({ ...validDecision, confidence }))).toEqual({
        accepted: true,
      })
    },
  )

  it('accepts a decision without its optional model', () => {
    const { model: _model, ...decision } = validDecision
    expect(validateDecisions(decisionText(decision))).toEqual({ accepted: true })
  })

  it('accepts a decision without its optional rejected', () => {
    const { rejected: _rejected, ...decision } = validDecision
    expect(validateDecisions(decisionText(decision))).toEqual({ accepted: true })
  })

  it('accepts a decision whose rejected is empty', () => {
    expect(validateDecisions(decisionText({ ...validDecision, rejected: [] }))).toEqual({
      accepted: true,
    })
  })

  it.each(['{', 'not json'])('rejects text that is not JSON (%j)', (text) => {
    expect(validateDecisions(text)).toEqual(rejection(1, null, 'is not valid JSON'))
  })

  it('accepts an empty file as zero decisions', () => {
    expect(validateDecisions('')).toEqual({ accepted: true })
  })

  it.each(['7', 'null', '"text"', '[]', 'true'])('rejects a line that is %s', (text) => {
    expect(validateDecisions(text)).toEqual(rejection(1, null, 'must be object'))
  })

  it.each(['at', 'step', 'role', 'kind', 'title', 'why', 'confidence'])(
    'rejects a decision missing its %s',
    (key) => {
      const { [key]: _removed, ...decision } = validDecision as Record<string, unknown>
      expect(validateDecisions(decisionText(decision))).toEqual(rejection(1, key, 'is required'))
    },
  )

  it.each([
    ['kind', 'bogus', 'must be one of decision, step_event, question, deviation'],
    ['confidence', 'certain', 'must be one of high, medium, low'],
  ])('rejects a decision whose %s is outside its enum (%s)', (key, value, message) => {
    expect(validateDecisions(decisionText({ ...validDecision, [key]: value }))).toEqual(
      rejection(1, key, message),
    )
  })

  it.each([
    ['at', 'must be string'],
    ['step', 'must be string'],
    ['role', 'must be string'],
    ['model', 'must be string'],
    ['title', 'must be string'],
    ['why', 'must be string'],
    ['confidence', 'must be string'],
    ['rejected', 'must be array'],
  ])('rejects a decision whose %s has the wrong type', (key, message) => {
    expect(validateDecisions(decisionText({ ...validDecision, [key]: 7 }))).toEqual(
      rejection(1, key, message),
    )
  })

  it.each(['at', 'step', 'role', 'model', 'title', 'why'])(
    'rejects a decision whose %s is empty',
    (key) => {
      expect(validateDecisions(decisionText({ ...validDecision, [key]: '' }))).toEqual(
        rejection(1, key, 'length must be at least 1'),
      )
    },
  )

  it.each(['extra', 'constructor', '__proto__'])('rejects an undeclared %s', (key) => {
    const decision = JSON.parse(JSON.stringify(validDecision))
    Object.defineProperty(decision, key, { value: 1, enumerable: true })
    expect(validateDecisions(decisionText(decision))).toEqual(
      rejection(1, key, 'is not allowed'),
    )
  })

  it.each([
    [7, 'must be string'],
    ['', 'length must be at least 1'],
  ])('rejects a decision whose rejected contains %j', (item, message) => {
    expect(validateDecisions(decisionText({ ...validDecision, rejected: [item] }))).toEqual(
      rejection(1, 'rejected', message),
    )
  })

  it('reports the first violation only when a line violates several rules', () => {
    const text = fileText(
      lineText(decisionWith()),
      '{"step":"s4","role":"dev-a","kind":"bogus","title":"t","why":"w","confidence":"high"}',
      lineText(decisionWith({ step: 's5' })),
    )
    expect(validateDecisions(text)).toEqual(rejection(2, 'at', 'is required'))
  })

  const paddedTo = (length: number): string => {
    const text = decisionText(validDecision)
    return text + ' '.repeat(length - text.length)
  }

  it('accepts a file of exactly 1048576 characters', () => {
    expect(validateDecisions(paddedTo(1_048_576))).toEqual({ accepted: true })
  })

  it('rejects a file of 1048577 characters with the single ceiling error without parsing it', () => {
    expect(validateDecisions('x'.repeat(1_048_577))).toEqual(
      rejection(null, null, 'exceeds 1048576 characters'),
    )
  })
})

describe('readDecisions', () => {
  it('returns 3 decisions and 1 error naming line 3 for 3 valid lines and 1 malformed line', () => {
    const text = fileText(
      lineText(decisionWith({ step: 's4' })),
      lineText(decisionWith({ step: 's5' })),
      '{not json',
      lineText(decisionWith({ step: 's6' })),
    )
    expect(readDecisions(text)).toEqual({
      decisions: [decisionWith({ step: 's4' }), decisionWith({ step: 's5' }), decisionWith({ step: 's6' })],
      errors: [readError(3, null, 'is not valid JSON')],
    })
  })

  it('reports the first violation only for a mid-file line that violates several rules', () => {
    const text = fileText(
      lineText(decisionWith()),
      '{"step":"s4","role":"dev-a","kind":"bogus","title":"t","why":"w","confidence":"high"}',
      lineText(decisionWith({ step: 's5' })),
    )
    expect(readDecisions(text)).toEqual({
      decisions: [decisionWith(), decisionWith({ step: 's5' })],
      errors: [readError(2, 'at', 'is required')],
    })
  })

  it.each(['', '   '])('rejects an interior %j line as invalid JSON', (blank) => {
    const text = fileText(lineText(decisionWith()), blank, lineText(decisionWith({ step: 's5' })))
    expect(readDecisions(text)).toEqual({
      decisions: [decisionWith(), decisionWith({ step: 's5' })],
      errors: [readError(2, null, 'is not valid JSON')],
    })
  })

  it('accepts lines with trailing carriage returns (CRLF)', () => {
    const text = `${decisionText(validDecision)}\r\n${decisionText({ ...validDecision, step: 's5' })}`
    expect(readDecisions(text)).toEqual({
      decisions: [decisionWith(), decisionWith({ step: 's5' })],
      errors: [],
    })
  })

  it('does not create a record for the trailing newline of a file', () => {
    expect(readDecisions(`${decisionText(validDecision)}\n`)).toEqual({
      decisions: [decisionWith()],
      errors: [],
    })
  })

  it('rejects a second consecutive trailing newline as a blank line', () => {
    expect(readDecisions(`${decisionText(validDecision)}\n\n`)).toEqual({
      decisions: [decisionWith()],
      errors: [readError(2, null, 'is not valid JSON')],
    })
  })

  it('accepts an empty file as zero decisions', () => {
    expect(readDecisions('')).toEqual({ decisions: [], errors: [] })
  })

  it('rejects a first-line byte order mark as invalid JSON', () => {
    expect(readDecisions(`\uFEFF${decisionText(validDecision)}`)).toEqual({
      decisions: [],
      errors: [readError(1, null, 'is not valid JSON')],
    })
  })

  it('matches the validator on the 1048577-character ceiling', () => {
    expect(readDecisions('x'.repeat(1_048_577))).toEqual({
      decisions: [],
      errors: [readError(null, null, 'exceeds 1048576 characters')],
    })
  })

  it('accepts a file of exactly 1048576 characters as one decision', () => {
    const padded = decisionText(validDecision) + ' '.repeat(1_048_576 - decisionText(validDecision).length)
    expect(readDecisions(padded)).toEqual({ decisions: [decisionWith()], errors: [] })
  })

  it.each([1, 99, 100])('shows every one of %i malformed lines without a cap marker', (count) => {
    const text = fileText(...Array.from({ length: count }, () => '{not json'))
    const result = readDecisions(text)
    expect(result.errors).toHaveLength(count)
    expect(result.errors).not.toContainEqual(tooManyMarker)
  })

  it('returns every valid decision next to 101 malformed lines and caps the errors', () => {
    const text = fileText(
      lineText(decisionWith({ step: 's1' })),
      ...Array.from({ length: 51 }, () => '{not json'),
      lineText(decisionWith({ step: 's2' })),
      ...Array.from({ length: 50 }, () => '{not json'),
    )
    const result = readDecisions(text)
    expect(result.decisions).toEqual([decisionWith({ step: 's1' }), decisionWith({ step: 's2' })])
    expect(result.errors).toHaveLength(101)
    expect(result.errors[0]).toEqual(readError(2, null, 'is not valid JSON'))
    expect(result.errors[99]).toEqual(readError(102, null, 'is not valid JSON'))
    expect(result.errors[100]).toEqual(tooManyMarker)
  })

  it.each([
    ['blank', '\n'.repeat(1_048_575), readError(1, null, 'is not valid JSON')],
    ['record-shaped', '{}\n'.repeat(349_000), readError(1, 'at', 'is required')],
  ])('reads a flood of %s lines in bounded time with the contract intact', (_, text, firstError) => {
    const start = performance.now()
    const result = readDecisions(text)
    const elapsed = performance.now() - start
    expect(result.decisions).toEqual([])
    expect(result.errors).toHaveLength(101)
    expect(result.errors[0]).toEqual(firstError)
    expect(result.errors[100]).toEqual(tooManyMarker)
    expect(elapsed).toBeLessThan(4000)
  })
})

describe('serializeDecision', () => {
  const decisionWithout = (key: string): Record<string, unknown> => {
    const { [key]: _omitted, ...decision } = validDecision as Record<string, unknown>
    return decision
  }

  it('serializes a valid decision to exactly one line', () => {
    expect(serializeDecision(decisionWith())).toEqual({
      accepted: true,
      line: lineText(validDecision),
    })
  })

  it('keeps U+2028 and U+2029 escaped inside string values', () => {
    const why = 'waiting\u2028then\u2029gone'
    const result = serializeDecision(decisionWith({ why }))
    if (!result.accepted) throw new Error('expected a serialization line')
    expect(result.line).not.toMatch(/[\n\r\u2028\u2029]/)
    expect(result.line).toContain('waiting\\u2028then\\u2029gone')
    expect(JSON.parse(result.line)).toEqual(decisionWith({ why }))
  })

  const serializedAtLength = (total: number): Record<string, unknown> => {
    const fixed = lineText(decisionWith()).length - (validDecision.why as string).length
    return decisionWith({ why: 'x'.repeat(total - fixed) })
  }

  it('accepts a decision whose serialized line is exactly 1048575 characters', () => {
    const decision = serializedAtLength(1_048_575)
    expect(serializeDecision(decision)).toEqual({ accepted: true, line: lineText(decision) })
  })

  it('rejects a decision whose serialized line is 1048576 characters', () => {
    expect(serializeDecision(serializedAtLength(1_048_576))).toEqual({
      accepted: false,
      error: { file: 'decisions.jsonl', location: null, field: null, message: 'exceeds 1048576 characters' },
    })
  })

  it('round-trips its longest accepted line through readDecisions with the file newline', () => {
    const decision = serializedAtLength(1_048_575)
    const result = serializeDecision(decision)
    if (!result.accepted) throw new Error('expected a serialization line')
    expect(readDecisions(`${result.line}\n`)).toEqual({ decisions: [decision], errors: [] })
  })

  it('counts the escape expansion in the line bound', () => {
    const fixed = lineText(decisionWith({ why: '' })).length
    const expandedTo = (total: number): Record<string, unknown> => {
      const escapes = 174_000
      return decisionWith({ why: '\u0085'.repeat(escapes) + 'x'.repeat(total - fixed - 6 * escapes) })
    }
    const atLimit = serializeDecision(expandedTo(1_048_575))
    if (!atLimit.accepted) throw new Error('expected a serialization line')
    expect(atLimit.line).toHaveLength(1_048_575)
    expect(serializeDecision(expandedTo(1_048_576))).toEqual({
      accepted: false,
      error: { file: 'decisions.jsonl', location: null, field: null, message: 'exceeds 1048576 characters' },
    })
  })

  it('escapes the unicode next-line character U+0085 inside string values', () => {
    const why = 'waiting\u0085then'
    const result = serializeDecision(decisionWith({ why }))
    if (!result.accepted) throw new Error('expected a serialization line')
    expect(result.line).not.toMatch(/[\n\r\u0085\u2028\u2029]/)
    expect(result.line).toContain('waiting\\u0085then')
    expect(JSON.parse(result.line)).toEqual(decisionWith({ why }))
  })

  it.each([
    ['missing its confidence', decisionWithout('confidence'), 'confidence', 'is required'],
    [
      'outside the kind enum',
      decisionWith({ kind: 'bogus' }),
      'kind',
      'must be one of decision, step_event, question, deviation',
    ],
    ['carrying an undeclared extra field', decisionWith({ extra: 1 }), 'extra', 'is not allowed'],
    ['carrying an empty title', decisionWith({ title: '' }), 'title', 'length must be at least 1'],
    ['carrying a non-string rejected item', decisionWith({ rejected: [7] }), 'rejected', 'must be string'],
  ])('produces no line and an error for a decision that is %s', (_, decision, field, message) => {
    expect(serializeDecision(decision)).toEqual({
      accepted: false,
      error: { file: 'decisions.jsonl', location: null, field, message },
    })
  })

  it('produces no line and an error for a decision carrying an undeclared __proto__ field', () => {
    const decision = JSON.parse(JSON.stringify(validDecision))
    Object.defineProperty(decision, '__proto__', { value: 1, enumerable: true })
    expect(serializeDecision(decision)).toEqual({
      accepted: false,
      error: { file: 'decisions.jsonl', location: null, field: '__proto__', message: 'is not allowed' },
    })
  })

  it.each([7, null, 'text', [], true])(
    'produces no line and an error for the non-object %j',
    (value) => {
      expect(serializeDecision(value)).toEqual({
        accepted: false,
        error: { file: 'decisions.jsonl', location: null, field: null, message: 'must be object' },
      })
    },
  )

  it('rejects a decision whose inherited toJSON forges the record', () => {
    const value = JSON.parse(JSON.stringify(validDecision))
    Object.setPrototypeOf(value, { toJSON: () => ({ forged: 1 }) })
    expect(serializeDecision(value)).toEqual({
      accepted: false,
      error: { file: 'decisions.jsonl', location: null, field: 'at', message: 'is required' },
    })
  })

  it('rejects a toJSON that returns nothing instead of a line', () => {
    const value = JSON.parse(JSON.stringify(validDecision))
    Object.defineProperty(value, 'toJSON', { value: () => undefined, enumerable: false })
    expect(serializeDecision(value)).toEqual({
      accepted: false,
      error: { file: 'decisions.jsonl', location: null, field: null, message: 'is not serializable' },
    })
  })

  it('rejects a toJSON that throws instead of throwing', () => {
    const value = JSON.parse(JSON.stringify(validDecision))
    Object.defineProperty(value, 'toJSON', {
      value: () => {
        throw new Error('boom')
      },
      enumerable: false,
    })
    expect(serializeDecision(value)).toEqual({
      accepted: false,
      error: { file: 'decisions.jsonl', location: null, field: null, message: 'is not serializable' },
    })
  })

  it('rejects a getter that throws instead of throwing', () => {
    const value = JSON.parse(JSON.stringify(validDecision))
    Object.defineProperty(value, 'at', {
      enumerable: true,
      get() {
        throw new Error('boom')
      },
    })
    expect(serializeDecision(value)).toEqual({
      accepted: false,
      error: { file: 'decisions.jsonl', location: null, field: null, message: 'is not serializable' },
    })
  })

  it('never writes the forged value of a getter that changes between reads', () => {
    let reads = 0
    const value = JSON.parse(JSON.stringify(validDecision))
    Object.defineProperty(value, 'kind', {
      enumerable: true,
      get() {
        reads += 1
        return reads === 1 ? 'decision' : 'bogus'
      },
    })
    expect(serializeDecision(value)).toEqual({
      accepted: true,
      line: lineText(validDecision),
    })
  })

  it('rejects a toJSON that returns a plain string instead of a record', () => {
    const value = JSON.parse(JSON.stringify(validDecision))
    Object.defineProperty(value, 'toJSON', { value: () => 'forged', enumerable: false })
    expect(serializeDecision(value)).toEqual({
      accepted: false,
      error: { file: 'decisions.jsonl', location: null, field: null, message: 'must be object' },
    })
  })
})
