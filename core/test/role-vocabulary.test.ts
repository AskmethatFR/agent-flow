import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ROLE_IDS } from '../src/lifecycle/roles'

const rules = readFileSync(
  fileURLToPath(new URL('../../rules/decision-logging.md', import.meta.url)),
  'utf8',
)

const idsInRoleTable = (): string[] =>
  [...rules.matchAll(/^\| [^|]+ \| `([^`]+)` \|$/gm)].map((row) => row[1] as string)

describe('role vocabulary', () => {
  it('lists the role ids of the decision logging rule table, in order', () => {
    expect(ROLE_IDS).toEqual(idsInRoleTable())
  })
})
