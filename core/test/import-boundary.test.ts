import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findBoundaryViolations, readSourceFiles, type BoundaryRule } from './import-boundary'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const root = '/repo'
const file = `${root}/core/src/placeholder/fixture.ts`

const violationsIn = (text: string) => findBoundaryViolations([{ path: file, text }], root)

const forbiddenImports = (rule: BoundaryRule, rows: [string, string][]) =>
  it.each(rows)(`flags %s as ${rule}`, (text, specifier) => {
    expect(violationsIn(text)).toEqual([{ file, specifier, rule }])
  })

const allowedImports = (label: string, rows: string[]) =>
  it.each(rows)(`allows %s (${label})`, (text) => {
    expect(violationsIn(text)).toEqual([])
  })

describe('core import boundary', () => {
  describe('sibling-workspace', () => {
    forbiddenImports('sibling-workspace', [
      ["import { a } from '@agent-flow/daemon'", '@agent-flow/daemon'],
      ["import type { a } from '@agent-flow/panel'", '@agent-flow/panel'],
      ["export { a } from '@agent-flow/capture-shared'", '@agent-flow/capture-shared'],
      ["const a = await import('@agent-flow/capture-opencode')", '@agent-flow/capture-opencode'],
      ["const a = require('@agent-flow/capture-claude-code')", '@agent-flow/capture-claude-code'],
      ["import { a } from '../../../daemon/src/index'", '../../../daemon/src/index'],
      ["import { a } from '../../../panel/index.client'", '../../../panel/index.client'],
      ["import { a } from '../../../capture/shared/src/index'", '../../../capture/shared/src/index'],
      ["import { a } from '../../../daemon'", '../../../daemon'],
    ])

    allowedImports('sibling-workspace near misses', [
      "import { a } from '../../../panel-docs/x'",
      "import { a } from '../../../capture-notes/y'",
      "import { a } from '@agent-flow/core'",
      "import { a } from '@scope/daemon'",
    ])
  })

  describe('host-package', () => {
    forbiddenImports('host-package', [
      ["import { a } from '@getpaseo/server'", '@getpaseo/server'],
      ["import { a } from 'paseo-sdk/client'", 'paseo-sdk/client'],
      ["import type { a } from '@opencode-ai/sdk'", '@opencode-ai/sdk'],
      ["const a = require('opencode')", 'opencode'],
      ["import { a } from '@Paseo/server'", '@Paseo/server'],
      ["import { a } from 'OpenCode'", 'OpenCode'],
    ])
  })

  describe('react-native', () => {
    forbiddenImports('react-native', [
      ["import { View } from 'react-native'", 'react-native'],
      ["import { a } from 'react-native-svg'", 'react-native-svg'],
      ["import { a } from '@react-native/assets'", '@react-native/assets'],
      ["import { a } from '@react-native-async-storage/async-storage'", '@react-native-async-storage/async-storage'],
    ])

    allowedImports('react-native near misses', [
      "import { a } from 'not-react-native'",
      "import { a } from 'react-nativex'",
      "import { a } from '@scope/react-native'",
      "import { a } from '@react-nativeish/x'",
    ])
  })

  describe('node-builtin', () => {
    forbiddenImports('node-builtin', [
      ["import { readFileSync } from 'node:fs'", 'node:fs'],
      ["import { join } from 'path'", 'path'],
      ["import { readFile } from 'fs/promises'", 'fs/promises'],
      ["const a = require('node:module')", 'node:module'],
    ])
  })

  it('allows relative imports inside core, schemas, test tooling and the word daemon in comments or strings', () => {
    const text = [
      "import { a } from './sibling'",
      "import { b } from '../other/index'",
      "import schema from '../../../schemas/x.json'",
      "import { it } from 'vitest'",
      '// import { c } from "@agent-flow/daemon"',
      "const note = \"import { d } from 'node:fs' and @agent-flow/panel\"",
    ].join('\n')

    expect(violationsIn(text)).toEqual([])
  })

  it('finds no violation in the real core/src tree', () => {
    const files = readSourceFiles(`${repoRoot}core/src`)

    expect(files.map((source) => source.path)).toContain(`${repoRoot}core/src/index.ts`)
    expect(findBoundaryViolations(files, repoRoot)).toEqual([])
  })

  describe('readSourceFiles', () => {
    let scanned = ''
    const sourceNames = ['a.ts', 'b.tsx', 'c.mts', 'd.cts', 'e.js', 'f.jsx', 'g.mjs', 'h.cjs']

    beforeAll(() => {
      scanned = mkdtempSync(join(tmpdir(), 'import-boundary-'))
      mkdirSync(join(scanned, 'nested', 'deeper'), { recursive: true })
      sourceNames.forEach((name) => writeFileSync(join(scanned, name), 'export {}'))
      writeFileSync(join(scanned, 'nested', 'deeper', 'i.ts'), 'export {}')
      writeFileSync(join(scanned, 'data.json'), '{}')
      writeFileSync(join(scanned, 'notes.md'), 'text')
    })

    afterAll(() => rmSync(scanned, { recursive: true, force: true }))

    it('reads every source extension recursively and nothing else', () => {
      const paths = readSourceFiles(scanned).map((source) => source.path)

      expect(paths.sort()).toEqual(
        [...sourceNames.map((name) => join(scanned, name)), join(scanned, 'nested', 'deeper', 'i.ts')].sort(),
      )
    })
  })
})
