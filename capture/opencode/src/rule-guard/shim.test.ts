import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repo = fileURLToPath(new URL('../../../../', import.meta.url))
const shimPath = join(repo, 'rules/opencode/opencode.json')
const guardDirectory = join(repo, 'capture/opencode/src/rule-guard')

const shim = (): Record<string, unknown> => JSON.parse(readFileSync(shimPath, 'utf8'))

describe('the OpenCode shim', () => {
  it('enables the rule guard through the plugins key, as a directory path relative to the shim', () => {
    const { plugins, plugin } = shim()
    expect(plugin).toBeUndefined()
    expect(plugins).toHaveLength(1)
    const entry = (plugins as string[])[0] as string
    expect(entry.startsWith('.')).toBe(true)
    expect(realpathSync(resolve(dirname(shimPath), entry))).toBe(realpathSync(guardDirectory))
  })

  it('has the guard directory default-export the rule guard plugin from index.ts', async () => {
    const { default: plugin } = await import('./index')
    expect(plugin).toMatchObject({ id: 'agent-flow.rule-guard', setup: expect.any(Function) })
  })
})
