import { describe, expect, it } from 'vitest'
import verifiedFactsSchema from '../../schemas/verified-facts.schema.json' with { type: 'json' }
import { validateVerifiedFacts, verifiedFactsContract } from './verified-facts'

const attachedVitest = {
  at: '2026-11-23T12:00:00.000Z',
  tool: 'vitest',
  step: '1',
  attachment: 'role',
  role: 'dev-a',
  roleFrom: 'agent',
  passed: 1791,
  total: 1791,
  failedSuites: 0,
}

const unattachedStryker = {
  at: '2026-11-23T12:05:00.000Z',
  tool: 'stryker',
  step: null,
  attachment: 'unattached',
  role: null,
  roleFrom: null,
  detected: 2410,
  surviving: 3,
}

const factWith = (overlays: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...attachedVitest,
  ...overlays,
})

const factWithout = (key: string): Record<string, unknown> => {
  const { [key]: _removed, ...rest } = attachedVitest as Record<string, unknown>
  return rest
}

const lineText = (value: unknown): string => JSON.stringify(value)

const fileText = (...lines: string[]): string => lines.join('\n')

const rejection = (location: number | null, field: string | null, message: string) => ({
  accepted: false,
  errors: [{ file: 'verified-facts.jsonl', location, field, message }],
})

describe('verified-facts.schema.json', () => {
  it('declares the schema version in its $id', () => {
    expect(verifiedFactsSchema.$id).toBe('urn:agent-flow:schema:verified-fact:1')
  })
})

describe('validateVerifiedFacts', () => {
  it('accepts the two sample lines of the decision record, one attached and one unattached', () => {
    const text = fileText(lineText(attachedVitest), lineText(unattachedStryker))
    expect(validateVerifiedFacts(text)).toEqual({ accepted: true })
  })

  it('accepts an empty file', () => {
    expect(validateVerifiedFacts('')).toEqual({ accepted: true })
  })

  it.each(['at', 'tool', 'step', 'attachment', 'role', 'roleFrom'])(
    'refuses a line without %s, naming its line number',
    (key) => {
      const text = fileText(lineText(attachedVitest), lineText(factWithout(key)))
      expect(validateVerifiedFacts(text)).toEqual(rejection(2, key, 'is required'))
    },
  )

  it('refuses a tool that is not vitest, cucumber-js or stryker, naming its line number', () => {
    const text = fileText(lineText(attachedVitest), lineText(factWith({ tool: 'jest' })))
    expect(validateVerifiedFacts(text)).toEqual(
      rejection(2, 'tool', 'must be one of vitest, cucumber-js, stryker'),
    )
  })

  it('refuses an attachment that is not role, only-step or unattached, naming its line number', () => {
    const text = fileText(lineText(attachedVitest), lineText(factWith({ attachment: 'session' })))
    expect(validateVerifiedFacts(text)).toEqual(
      rejection(2, 'attachment', 'must be one of role, only-step, unattached'),
    )
  })

  it.each(['source', 'stdout', 'command', 'session_id', 'agent_id', 'fingerprint'])(
    'refuses a line carrying %s, naming its line number and the key and never the value',
    (key) => {
      const forbidden = 'FORBIDDEN-VALUE-MUST-NOT-BE-ECHOED'
      const text = fileText(lineText(attachedVitest), lineText(factWith({ [key]: forbidden })))
      const result = validateVerifiedFacts(text)
      expect(result).toEqual(rejection(2, key, 'is not allowed'))
      expect(JSON.stringify(result)).not.toContain(forbidden)
    },
  )

  it('sizes the post-cap prefilter on the shortest valid compact line', () => {
    const shortest =
      '{"at":"2026-11-23T12:00:00.000Z","tool":"stryker","step":"1","attachment":"role","role":"qa","roleFrom":"host","detected":0,"surviving":1}'
    expect(validateVerifiedFacts(shortest)).toEqual({ accepted: true })
    expect(verifiedFactsContract.minimumRecordLength).toBe(shortest.length)
  })
})
