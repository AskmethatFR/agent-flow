import { describe, expect, it } from 'vitest'
import requestsSchema from '../../../schemas/requests.schema.json' with { type: 'json' }
import { validateRequests } from './index'
import { requestsContract } from './requests'

const validRequest = {
  id: 'r-0007',
  at: '2026-10-22T11:48:00Z',
  step: 's4',
  role: 'dev-b',
  type: 'question',
  text: 'Is the link valid on two devices?',
  options: ['Single use', 'Valid 15 min everywhere'],
  blocking: true,
}

const requestWith = (overlays: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...validRequest,
  ...overlays,
})

const lineText = (value: unknown): string => JSON.stringify(value)

const fileText = (...lines: string[]): string => lines.join('\n')

const rejection = (location: number | null, field: string | null, message: string) => ({
  accepted: false,
  errors: [{ file: 'requests.jsonl', location, field, message }],
})

const idMessage = 'must match ^[A-Za-z0-9._:-]{1,64}$'

describe('requests.schema.json', () => {
  it('declares the schema version in its $id', () => {
    expect(requestsSchema.$id).toBe('urn:agent-flow:schema:request:1')
  })
})

describe('validateRequests', () => {
  it('accepts the drafted request line of docs/plan.md verbatim', () => {
    const drafted =
      '{"id":"r-0007","at":"2026-10-22T11:48:00Z","step":"s4","role":"dev-b","type":"question","text":"Is the link valid on two devices?","options":["Single use","Valid 15 min everywhere"],"blocking":true}'
    expect(validateRequests(drafted)).toEqual({ accepted: true })
  })

  it.each(['question', 'added_step', 'out_of_scope', 'out_of_spec'])(
    'accepts a request whose type is %s',
    (type) => {
      expect(validateRequests(lineText(requestWith({ type })))).toEqual({ accepted: true })
    },
  )

  it.each([true, false])('accepts a request whose blocking is %s', (blocking) => {
    expect(validateRequests(lineText(requestWith({ blocking })))).toEqual({ accepted: true })
  })

  it('accepts a request without its optional options', () => {
    const { options: _options, ...request } = validRequest
    expect(validateRequests(lineText(request))).toEqual({ accepted: true })
  })

  it('accepts a request whose options is empty', () => {
    expect(validateRequests(lineText(requestWith({ options: [] })))).toEqual({ accepted: true })
  })

  it('accepts an empty file as zero requests', () => {
    expect(validateRequests('')).toEqual({ accepted: true })
  })

  it.each(['{', 'not json'])('rejects text that is not JSON (%j)', (text) => {
    expect(validateRequests(text)).toEqual(rejection(1, null, 'is not valid JSON'))
  })

  it.each(['7', 'null', '[]'])('rejects a line that is %s', (text) => {
    expect(validateRequests(text)).toEqual(rejection(1, null, 'must be object'))
  })

  it.each(['id', 'at', 'step', 'role', 'type', 'text', 'blocking'])(
    'rejects a request missing its %s',
    (key) => {
      const { [key]: _removed, ...request } = validRequest as Record<string, unknown>
      expect(validateRequests(lineText(request))).toEqual(rejection(1, key, 'is required'))
    },
  )

  it.each([
    ['id', 7, 'must be string'],
    ['at', 7, 'must be string'],
    ['step', 7, 'must be string'],
    ['role', 7, 'must be string'],
    ['type', 7, 'must be string'],
    ['text', 7, 'must be string'],
    ['options', 7, 'must be array'],
    ['blocking', 'true', 'must be boolean'],
    ['blocking', 1, 'must be boolean'],
  ])('rejects a request whose %s is %j', (key, value, message) => {
    expect(validateRequests(lineText(requestWith({ [key]: value })))).toEqual(
      rejection(1, key, message),
    )
  })

  it.each(['at', 'step', 'role', 'text'])('rejects a request whose %s is empty', (key) => {
    expect(validateRequests(lineText(requestWith({ [key]: '' })))).toEqual(
      rejection(1, key, 'length must be at least 1'),
    )
  })

  it('rejects an unknown request type with the allowed values and without echoing it', () => {
    expect(validateRequests(lineText(requestWith({ type: 'approval' })))).toEqual(
      rejection(1, 'type', 'must be one of question, added_step, out_of_scope, out_of_spec'),
    )
  })

  it.each([
    ['empty', ''],
    ['containing a space', 'r 7'],
    ['containing a slash', 'r/7'],
    ['containing a newline', 'r-7\n'],
    ['containing a non-ASCII letter', 'r-é'],
    ['65 characters long', 'a'.repeat(65)],
  ])('rejects a request id that is %s', (_, id) => {
    expect(validateRequests(lineText(requestWith({ id })))).toEqual(rejection(1, 'id', idMessage))
  })

  it.each([
    ['one character', 'a'],
    ['64 characters', 'a'.repeat(64)],
    ['every allowed punctuation', 'A0._:-z9'],
  ])('accepts a request id of %s', (_, id) => {
    expect(validateRequests(lineText(requestWith({ id })))).toEqual({ accepted: true })
  })

  it.each([
    [7, 'must be string'],
    ['', 'length must be at least 1'],
  ])('rejects a request whose options contains %j', (item, message) => {
    expect(validateRequests(lineText(requestWith({ options: [item] })))).toEqual(
      rejection(1, 'options', message),
    )
  })

  it('rejects an undeclared field', () => {
    expect(validateRequests(lineText(requestWith({ extra: 1 })))).toEqual(
      rejection(1, 'extra', 'is not allowed'),
    )
  })

  it('rejects an undeclared field whose name cannot be shown without naming it', () => {
    expect(validateRequests(lineText(requestWith({ 'a b\u0007': 1 })))).toEqual(
      rejection(1, null, 'is not allowed'),
    )
  })

  it('names the line of the first malformed request and no other', () => {
    const text = fileText(
      lineText(requestWith({ id: 'a' })),
      lineText(requestWith({ id: 'b', type: 'approval' })),
      lineText(requestWith({ id: 'c' })),
    )
    expect(validateRequests(text)).toEqual(
      rejection(2, 'type', 'must be one of question, added_step, out_of_scope, out_of_spec'),
    )
  })

  it('reports the first violation only when a line violates several rules', () => {
    const text = '{"id":"r-1","at":"t","step":"s","role":"r","type":"bogus","text":"x"}'
    expect(validateRequests(text)).toEqual(rejection(1, 'blocking', 'is required'))
  })

  const duplicate = (location: number) => ({
    file: 'requests.jsonl',
    location,
    field: 'id',
    message: 'must be unique',
  })

  it.each([
    ['one repeat', ['a', 'a'], [2]],
    ['a triple', ['a', 'a', 'a'], [2, 3]],
    ['repeats in file order', ['a', 'b', 'a', 'b'], [3, 4]],
    ['a repeat after distinct ids', ['a', 'b', 'c', 'b'], [4]],
  ])('rejects duplicate request ids: %s', (_, ids, locations) => {
    const text = fileText(...ids.map((id) => lineText(requestWith({ id }))))
    expect(validateRequests(text)).toEqual({ accepted: false, errors: locations.map(duplicate) })
  })

  it('accepts distinct request ids, ids differing only by case included', () => {
    const text = fileText(...['a', 'A', 'b'].map((id) => lineText(requestWith({ id }))))
    expect(validateRequests(text)).toEqual({ accepted: true })
  })

  it('reports only the schema violation of a line that also reuses an earlier id', () => {
    const text = fileText(
      lineText(requestWith({ id: 'a' })),
      lineText(requestWith({ id: 'a', type: 'approval' })),
    )
    expect(validateRequests(text)).toEqual(
      rejection(2, 'type', 'must be one of question, added_step, out_of_scope, out_of_spec'),
    )
  })

  it('does not reserve the id of a line the schema rejected', () => {
    const text = fileText(
      lineText(requestWith({ id: 'a' })),
      lineText(requestWith({ id: 'b', type: 'approval' })),
      lineText(requestWith({ id: 'b' })),
    )
    expect(validateRequests(text)).toEqual(
      rejection(2, 'type', 'must be one of question, added_step, out_of_scope, out_of_spec'),
    )
  })

  it('sizes the post-cap prefilter on the shortest valid compact record', () => {
    const shortest = '{"id":"a","at":"a","step":"a","role":"a","type":"question","text":"a","blocking":true}'
    expect(validateRequests(shortest)).toEqual({ accepted: true })
    expect(requestsContract.minimumRecordLength).toBe(shortest.length)
  })

  const paddedTo = (length: number): string => {
    const text = lineText(validRequest)
    return text + ' '.repeat(length - text.length)
  }

  it('accepts a file of exactly 1048576 characters', () => {
    expect(validateRequests(paddedTo(1_048_576))).toEqual({ accepted: true })
  })

  it('rejects a file of 1048577 characters with the single ceiling error without parsing it', () => {
    expect(validateRequests('x'.repeat(1_048_577))).toEqual(
      rejection(null, null, 'exceeds 1048576 characters'),
    )
  })

  it('shows at most 100 errors followed by the cap marker', () => {
    const result = validateRequests(fileText(...Array.from({ length: 150 }, () => '{not json')))
    expect(result.accepted).toBe(false)
    if (result.accepted) throw new Error('expected a rejection')
    expect(result.errors).toHaveLength(101)
    expect(result.errors[99]).toEqual({
      file: 'requests.jsonl',
      location: 100,
      field: null,
      message: 'is not valid JSON',
    })
    expect(result.errors[100]).toEqual({
      file: 'requests.jsonl',
      location: null,
      field: null,
      message: 'too many errors, only the first 100 are shown',
    })
  })
})
