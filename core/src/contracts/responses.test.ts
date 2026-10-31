import { describe, expect, it } from 'vitest'
import responsesSchema from '../../../schemas/responses.schema.json' with { type: 'json' }
import { validateResponses } from './index'
import { responsesContract } from './responses'

const validResponse = {
  id: 'r-0007',
  at: '2026-10-22T12:35:00Z',
  answer: 'Single use',
}

const responseWith = (overlays: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...validResponse,
  ...overlays,
})

const lineText = (value: unknown): string => JSON.stringify(value)

const fileText = (...lines: string[]): string => lines.join('\n')

const rejection = (location: number | null, field: string | null, message: string) => ({
  accepted: false,
  errors: [{ file: 'responses.jsonl', location, field, message }],
})

const idMessage = 'must match ^[A-Za-z0-9._:-]{1,64}$'

describe('responses.schema.json', () => {
  it('declares the schema version in its $id', () => {
    expect(responsesSchema.$id).toBe('urn:agent-flow:schema:response:1')
  })
})

describe('validateResponses', () => {
  it('accepts the drafted response line of docs/plan.md verbatim', () => {
    const drafted = '{"id":"r-0007","at":"2026-10-22T12:35:00Z","answer":"Single use"}'
    expect(validateResponses(drafted)).toEqual({ accepted: true })
  })

  it('accepts an empty file as zero responses', () => {
    expect(validateResponses('')).toEqual({ accepted: true })
  })

  it('accepts several answers to the same request id, since the log is append-only', () => {
    const text = fileText(
      lineText(responseWith({ answer: 'first' })),
      lineText(responseWith({ answer: 'second' })),
    )
    expect(validateResponses(text)).toEqual({ accepted: true })
  })

  it.each(['{', 'not json'])('rejects text that is not JSON (%j)', (text) => {
    expect(validateResponses(text)).toEqual(rejection(1, null, 'is not valid JSON'))
  })

  it.each(['7', 'null', '[]'])('rejects a line that is %s', (text) => {
    expect(validateResponses(text)).toEqual(rejection(1, null, 'must be object'))
  })

  it.each(['id', 'at', 'answer'])('rejects a response missing its %s', (key) => {
    const { [key]: _removed, ...response } = validResponse as Record<string, unknown>
    expect(validateResponses(lineText(response))).toEqual(rejection(1, key, 'is required'))
  })

  it.each(['id', 'at', 'answer'])('rejects a response whose %s has the wrong type', (key) => {
    expect(validateResponses(lineText(responseWith({ [key]: 7 })))).toEqual(
      rejection(1, key, 'must be string'),
    )
  })

  it.each(['at', 'answer'])('rejects a response whose %s is empty', (key) => {
    expect(validateResponses(lineText(responseWith({ [key]: '' })))).toEqual(
      rejection(1, key, 'length must be at least 1'),
    )
  })

  it.each([
    ['empty', ''],
    ['containing a space', 'r 7'],
    ['containing a slash', 'r/7'],
    ['containing a newline', 'r-7\n'],
    ['containing a non-ASCII letter', 'r-é'],
    ['65 characters long', 'a'.repeat(65)],
  ])('rejects a response id that is %s', (_, id) => {
    expect(validateResponses(lineText(responseWith({ id })))).toEqual(rejection(1, 'id', idMessage))
  })

  it.each([
    ['one character', 'a'],
    ['64 characters', 'a'.repeat(64)],
    ['every allowed punctuation', 'A0._:-z9'],
  ])('accepts a response id of %s', (_, id) => {
    expect(validateResponses(lineText(responseWith({ id })))).toEqual({ accepted: true })
  })

  it('rejects an undeclared field', () => {
    expect(validateResponses(lineText(responseWith({ extra: 1 })))).toEqual(
      rejection(1, 'extra', 'is not allowed'),
    )
  })

  it('rejects an undeclared provenance field, which must not live in an agent-writable file', () => {
    expect(validateResponses(lineText(responseWith({ by: 'human' })))).toEqual(
      rejection(1, 'by', 'is not allowed'),
    )
  })

  it('names the line of the first malformed response and no other', () => {
    const text = fileText(lineText(responseWith()), '{not json', lineText(responseWith()))
    expect(validateResponses(text)).toEqual(rejection(2, null, 'is not valid JSON'))
  })

  it('sizes the post-cap prefilter on the shortest valid compact record', () => {
    const shortest = '{"id":"a","at":"a","answer":"a"}'
    expect(validateResponses(shortest)).toEqual({ accepted: true })
    expect(responsesContract.minimumRecordLength).toBe(shortest.length)
  })

  const paddedTo = (length: number): string => {
    const text = lineText(validResponse)
    return text + ' '.repeat(length - text.length)
  }

  it('accepts a file of exactly 1048576 characters', () => {
    expect(validateResponses(paddedTo(1_048_576))).toEqual({ accepted: true })
  })

  it('rejects a file of 1048577 characters with the single ceiling error without parsing it', () => {
    expect(validateResponses('x'.repeat(1_048_577))).toEqual(
      rejection(null, null, 'exceeds 1048576 characters'),
    )
  })

  it('shows at most 100 errors followed by the cap marker', () => {
    const result = validateResponses(fileText(...Array.from({ length: 150 }, () => '{not json')))
    expect(result.accepted).toBe(false)
    if (result.accepted) throw new Error('expected a rejection')
    expect(result.errors).toHaveLength(101)
    expect(result.errors[100]).toEqual({
      file: 'responses.jsonl',
      location: null,
      field: null,
      message: 'too many errors, only the first 100 are shown',
    })
  })
})
