import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const coreRoot = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)

const moduleFolders = readdirSync(`${coreRoot}src`, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

describe('core package exports', () => {
  it('exposes every module folder as a subpath resolving to its index.ts', () => {
    const resolved = Object.fromEntries(
      moduleFolders.map((folder) => [folder, require.resolve(`@agent-flow/core/${folder}`)]),
    )
    const expected = Object.fromEntries(
      moduleFolders.map((folder) => [folder, `${coreRoot}src/${folder}/index.ts`]),
    )

    expect(moduleFolders.length).toBeGreaterThan(0)
    expect(resolved).toEqual(expected)
  })
})
