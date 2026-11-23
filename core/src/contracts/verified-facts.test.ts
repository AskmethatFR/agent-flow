import { describe, expect, it } from 'vitest'
import verifiedFactsSchema from '../../schemas/verified-facts.schema.json' with { type: 'json' }
import { ROLE_IDS } from '../lifecycle/roles'
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

const toolFact = (tool: string): Record<string, unknown> =>
  tool === 'stryker' ? { ...unattachedStryker } : { ...attachedVitest, tool }

const shortestLine = (counts: Record<string, unknown>): string =>
  lineText({
    at: '2026-11-23T12:00:00.000Z',
    step: '1',
    attachment: 'role',
    role: 'qa',
    roleFrom: 'host',
    ...counts,
  })

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

  it('pins the role pattern to ROLE_IDS', () => {
    expect(verifiedFactsSchema.properties.role.pattern).toBe(`^(${ROLE_IDS.join('|')})$`)
  })

  it.each(ROLE_IDS)('accepts the role %s', (role) => {
    const text = fileText(lineText(factWith({ role })))
    expect(validateVerifiedFacts(text)).toEqual({ accepted: true })
  })

  it('refuses a role outside ROLE_IDS, naming its line number and field', () => {
    const text = fileText(lineText(attachedVitest), lineText(factWith({ role: 'intern' })))
    expect(validateVerifiedFacts(text)).toEqual(rejection(2, 'role', expect.any(String)))
  })

  it.each(['user', 'Host', ' host'])(
    'refuses a roleFrom of %j, which is not host or agent, naming its line number and field',
    (roleFrom) => {
      const text = fileText(lineText(attachedVitest), lineText(factWith({ roleFrom })))
      expect(validateVerifiedFacts(text)).toEqual(rejection(2, 'roleFrom', expect.any(String)))
    },
  )

  it.each(['host', 'agent'])('accepts a roleFrom of %s', (roleFrom) => {
    const text = fileText(lineText(factWith({ roleFrom })))
    expect(validateVerifiedFacts(text)).toEqual({ accepted: true })
  })

  it.each([
    '2026-11-23 12:00:00.000Z',
    '2026-11-23T12:00:00Z',
    '2026-11-23T12:00:00.0Z',
    '2026-11-23T12:00:00.000+00:00',
    '2026-13-23T12:00:00.000Z',
    'yesterday',
  ])('refuses an at of %j that is not the toISOString form, naming its line number and field', (at) => {
    const text = fileText(lineText(attachedVitest), lineText(factWith({ at })))
    expect(validateVerifiedFacts(text)).toEqual(rejection(2, 'at', expect.any(String)))
  })

  it('refuses an empty step, naming its line number and field', () => {
    const text = fileText(lineText(attachedVitest), lineText(factWith({ step: '' })))
    expect(validateVerifiedFacts(text)).toEqual(rejection(2, 'step', expect.any(String)))
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

  it('sizes the post-cap prefilter on the shortest valid compact line of any tool', () => {
    const shortest = [
      { tool: 'vitest', passed: 0, total: 0, failedSuites: 0 },
      { tool: 'cucumber-js', passed: 0, total: 0, failedSuites: 0 },
      { tool: 'stryker', detected: 0, surviving: 1 },
    ].map((counts) => shortestLine(counts))
    for (const line of shortest) expect(validateVerifiedFacts(line)).toEqual({ accepted: true })
    expect(verifiedFactsContract.minimumRecordLength).toBe(Math.min(...shortest.map((line) => line.length)))
  })

  it('refuses the shortest line without its counts, naming its line number and the first missing count', () => {
    const countless =
      '{"at":"2026-11-23T12:00:00.000Z","tool":"stryker","step":"1","attachment":"role","role":"qa","roleFrom":"host"}'
    expect(countless).toHaveLength(111)
    expect(countless.length).toBeLessThan(verifiedFactsContract.minimumRecordLength)
    const text = fileText(lineText(attachedVitest), countless)
    expect(validateVerifiedFacts(text)).toEqual(rejection(2, 'detected', 'is required'))
  })

  it.each([
    ['vitest', attachedVitest],
    ['cucumber-js', { ...attachedVitest, tool: 'cucumber-js' }],
    ['stryker', unattachedStryker],
  ])('accepts a %s line with its own counts', (_tool, fact) => {
    expect(validateVerifiedFacts(lineText(fact))).toEqual({ accepted: true })
  })

  it.each([
    ['vitest', 'passed'],
    ['vitest', 'total'],
    ['vitest', 'failedSuites'],
    ['cucumber-js', 'passed'],
    ['cucumber-js', 'total'],
    ['cucumber-js', 'failedSuites'],
    ['stryker', 'detected'],
    ['stryker', 'surviving'],
  ])('refuses a %s line without %s, naming its line number and field', (tool, count) => {
    const { [count]: _removed, ...rest } = toolFact(tool)
    const text = fileText(lineText(attachedVitest), lineText(rest))
    expect(validateVerifiedFacts(text)).toEqual(rejection(2, count, 'is required'))
  })

  it.each([
    ['vitest', 'passed'],
    ['vitest', 'total'],
    ['vitest', 'failedSuites'],
    ['cucumber-js', 'passed'],
    ['cucumber-js', 'total'],
    ['cucumber-js', 'failedSuites'],
    ['stryker', 'detected'],
    ['stryker', 'surviving'],
  ])('refuses a %s %s that is not a safe non-negative integer, naming its line number and field', (tool, count) => {
    for (const value of [-1, 1.5, '3', null, true, [1], {}, 2 ** 53]) {
      const text = fileText(lineText(attachedVitest), lineText({ ...toolFact(tool), [count]: value }))
      expect(validateVerifiedFacts(text)).toEqual(rejection(2, count, 'must be a non-negative integer'))
    }
  })

  it('refuses a count that overflows to Infinity', () => {
    const overflow = lineText(attachedVitest).replace('"passed":1791', '"passed":1e999')
    expect(validateVerifiedFacts(fileText(lineText(attachedVitest), overflow))).toEqual(
      rejection(2, 'passed', 'must be a non-negative integer'),
    )
  })

  it.each([0, 1, Number.MAX_SAFE_INTEGER])('accepts a count of %d', (value) => {
    const vitest = factWith({ passed: value, total: value, failedSuites: value })
    expect(validateVerifiedFacts(lineText(vitest))).toEqual({ accepted: true })
    const stryker = { ...unattachedStryker, detected: value, surviving: Math.max(value, 1) }
    expect(validateVerifiedFacts(lineText(stryker))).toEqual({ accepted: true })
  })

  it.each([
    ['vitest', 'detected'],
    ['vitest', 'surviving'],
    ['cucumber-js', 'detected'],
    ['cucumber-js', 'surviving'],
    ['stryker', 'passed'],
    ['stryker', 'total'],
    ['stryker', 'failedSuites'],
  ])('refuses a %s line carrying %s, naming its line number and field', (tool, count) => {
    const text = fileText(lineText(attachedVitest), lineText({ ...toolFact(tool), [count]: 1 }))
    expect(validateVerifiedFacts(text)).toEqual(rejection(2, count, 'is not allowed'))
  })

  it('reports the first failing count of a line: a missing one, then an invalid one, then a foreign one', () => {
    const missingAndForeign = { ...factWithout('passed'), detected: 1 }
    expect(validateVerifiedFacts(lineText(missingAndForeign))).toEqual(
      rejection(1, 'passed', 'is required'),
    )
    const invalidAndForeign = factWith({ total: -1, detected: 1 })
    expect(validateVerifiedFacts(lineText(invalidAndForeign))).toEqual(
      rejection(1, 'total', 'must be a non-negative integer'),
    )
  })

  it.each(['vitest', 'cucumber-js'])(
    'refuses a %s line with more passed than total, naming its line number and the field passed',
    (tool) => {
      const text = fileText(lineText(attachedVitest), lineText({ ...toolFact(tool), passed: 2, total: 1 }))
      expect(validateVerifiedFacts(text)).toEqual(rejection(2, 'passed', 'must not exceed total'))
    },
  )

  it.each(['vitest', 'cucumber-js'])('accepts a %s line with fewer passed than total', (tool) => {
    expect(validateVerifiedFacts(lineText({ ...toolFact(tool), passed: 1, total: 2 }))).toEqual({
      accepted: true,
    })
  })

  it('refuses a stryker line with no mutant at all, naming its line number and the field detected', () => {
    const text = fileText(lineText(unattachedStryker), lineText({ ...unattachedStryker, detected: 0, surviving: 0 }))
    expect(validateVerifiedFacts(text)).toEqual(
      rejection(2, 'detected', 'must not be 0 when surviving is 0'),
    )
  })

  it.each([
    [1, 0],
    [0, 1],
  ])('accepts a stryker line with %d detected and %d surviving', (detected, surviving) => {
    expect(validateVerifiedFacts(lineText({ ...unattachedStryker, detected, surviving }))).toEqual({
      accepted: true,
    })
  })

  it('checks the count relations only after the presence, type and foreign checks', () => {
    const missing = { ...factWithout('failedSuites'), passed: 2, total: 1 }
    expect(validateVerifiedFacts(lineText(missing))).toEqual(rejection(1, 'failedSuites', 'is required'))
    const invalid = factWith({ passed: 2, total: 1, failedSuites: -1 })
    expect(validateVerifiedFacts(lineText(invalid))).toEqual(
      rejection(1, 'failedSuites', 'must be a non-negative integer'),
    )
    const foreign = factWith({ passed: 2, total: 1, detected: 1 })
    expect(validateVerifiedFacts(lineText(foreign))).toEqual(rejection(1, 'detected', 'is not allowed'))
  })

  it('keeps a schema violation ahead of a count violation on the same line', () => {
    const text = lineText(factWith({ role: 'intern', passed: -1 }))
    expect(validateVerifiedFacts(text)).toEqual(rejection(1, 'role', expect.any(String)))
  })

  it('states the count rules in the schema description', () => {
    expect(verifiedFactsSchema.description).toContain('passed, total and failedSuites')
    expect(verifiedFactsSchema.description).toContain('detected and surviving')
  })

  it('states the count relations in the schema description', () => {
    expect(verifiedFactsSchema.description).toContain('passed never exceeds total')
    expect(verifiedFactsSchema.description).toContain('detected and surviving are never both 0')
  })
})
