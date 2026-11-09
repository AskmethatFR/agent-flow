import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const clientSource = fileURLToPath(new URL('.', import.meta.url))

const isProduction = (path: string): boolean =>
  /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.startsWith('testing/')

const productionFiles = readdirSync(clientSource, { recursive: true, encoding: 'utf8' })
  .filter(isProduction)
  .map((path) => ({ path, text: readFileSync(join(clientSource, path), 'utf8') }))

const computationTokens = [
  'Date.parse',
  'Date.now',
  'new Date',
  '.getTime(',
  'milliseconds',
  '60_000',
  'estimate',
  'budget',
]

const allowedImport = /^(\.{1,2}\/.+|react|react-native|zod|@getpaseo\/plugin\/client)$/

const importsOf = (text: string): string[] => ts.preProcessFile(text, true, true).importedFiles.map((file) => file.fileName)

const forbiddenImportsOf = (text: string): string[] => importsOf(text).filter((name) => !allowedImport.test(name))

const sdkSymbols = ['usePaseo', 'useAgent', 'useWorkspace', 'getPaseoClient']

const sdkSymbolsIn = (text: string): string[] => sdkSymbols.filter((symbol) => text.includes(symbol))

const statusLiteral = /['"`](running|initializing|idle|error|closed|stopped|unknown)['"`]/

describe('panel client boundary', () => {
  it('scans the production files', () => {
    const paths = productionFiles.map((file) => file.path)
    expect(paths).toContain('plan-rail.tsx')
    expect(paths).toContain('use-snapshot-polling.ts')
    expect(paths.filter((path) => path.endsWith('.test.tsx') || path.startsWith('testing/'))).toEqual([])
  })

  it.each([
    ['testing/render-panel.tsx', false],
    ['plan-rail.test.tsx', false],
    ['testing-helpers.ts', true],
    ['plan-rail.tsx', true],
  ])('classifies %s as production: %s', (path, expected) => {
    expect(isProduction(path)).toBe(expected)
  })

  it.each(productionFiles)('$path computes no time and shows no estimate', ({ text }) => {
    expect(computationTokens.filter((token) => text.includes(token))).toEqual([])
  })

  it.each(productionFiles)('$path imports only react, zod, the plugin client and relative modules', ({ text }) => {
    expect(forbiddenImportsOf(text)).toEqual([])
  })

  it.each(productionFiles)('$path calls no SDK hook or client', ({ text }) => {
    expect(sdkSymbolsIn(text)).toEqual([])
  })

  it.each(productionFiles)('$path maps no agent status', ({ text }) => {
    expect(statusLiteral.test(text)).toBe(false)
  })

  it.each([
    ["import { x } from '@getpaseo/plugin/server'", ['@getpaseo/plugin/server']],
    ["import { x } from 'node:fs'", ['node:fs']],
    ["import { Text } from 'react-native'", []],
    ["import { x } from './use-snapshot-polling.ts'", []],
  ])('import check on %s finds %j', (text, expected) => {
    expect(forbiddenImportsOf(text)).toEqual(expected)
  })

  it.each([
    ['const agents = usePaseo()', ['usePaseo']],
    ['const client = getPaseoClient()', ['getPaseoClient']],
    ['const line = `Agent: ${role} (${state})`', []],
  ])('SDK check on %s finds %j', (text, expected) => {
    expect(sdkSymbolsIn(text)).toEqual(expected)
  })

  it.each([
    ["const label = state === 'idle' ? 'stopped' : state", true],
    ['const line = `Agent: ${role} (${state})`', false],
    ["const line = 'Agent: dev-a (running)'", false],
  ])('status check on %s finds a status literal: %s', (text, expected) => {
    expect(statusLiteral.test(text)).toBe(expected)
  })
})
