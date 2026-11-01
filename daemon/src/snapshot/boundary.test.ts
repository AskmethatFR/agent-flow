import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const daemonSource = join(fileURLToPath(new URL('.', import.meta.url)), '..')

const productionFiles = readdirSync(daemonSource, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'))
  .map((path) => ({ path, text: readFileSync(join(daemonSource, path), 'utf8') }))

const allowedImport = /^(\.{1,2}\/.*|node:.+|@agent-flow\/core\/(snapshot|contracts)|zod)$/

const businessTokens = [
  'Date.parse',
  '.getTime(',
  '.filter(',
  "'in_progress'",
  "'todo'",
  "'done'",
  'timeSpent',
  'currentStepId',
]

describe('daemon boundary', () => {
  it('scans the production files', () => {
    expect(productionFiles.map((file) => file.path)).toContain('snapshot/get-snapshot.ts')
  })

  it.each(productionFiles)('$path imports only core snapshot and contracts, node and relative modules', ({ text }) => {
    const imports = ts.preProcessFile(text, true, true).importedFiles.map((file) => file.fileName)
    expect(imports.filter((name) => !allowedImport.test(name))).toEqual([])
  })

  it.each(productionFiles)('$path holds no business rule', ({ text }) => {
    expect(businessTokens.filter((token) => text.includes(token))).toEqual([])
  })
})
