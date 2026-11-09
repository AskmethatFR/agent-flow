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

const pluginClient = '@getpaseo/plugin/client'

const valueNamesOf = (elements: readonly (ts.ImportSpecifier | ts.ExportSpecifier)[]): string[] =>
  elements.filter((element) => !element.isTypeOnly).map((element) => (element.propertyName ?? element.name).text)

const importedValueNames = ({ importClause }: ts.ImportDeclaration): string[] => {
  if (importClause === undefined || importClause.isTypeOnly) return []
  const { name, namedBindings } = importClause
  const named = namedBindings === undefined ? [] : ts.isNamespaceImport(namedBindings) ? ['*'] : valueNamesOf(namedBindings.elements)
  return name === undefined ? named : ['default', ...named]
}

const exportedValueNames = ({ isTypeOnly, exportClause }: ts.ExportDeclaration): string[] => {
  if (isTypeOnly) return []
  return exportClause === undefined || ts.isNamespaceExport(exportClause) ? ['*'] : valueNamesOf(exportClause.elements)
}

const valueNamesFromPluginClient = (statement: ts.Statement): string[] => {
  if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === pluginClient) {
    return importedValueNames(statement)
  }
  if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === pluginClient) {
    return exportedValueNames(statement)
  }
  return []
}

const sdkValueImportsBeyondUseRpc = (text: string): string[] =>
  ts
    .createSourceFile('probe.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    .statements.flatMap(valueNamesFromPluginClient)
    .filter((name) => name !== 'useRpc')

const statusLiteral =
  /['"`](?:running|initializing|idle|error|closed|stopped|unknown)['"`]|\b(?:running|initializing|idle|error|closed|stopped|unknown)\s*:/i

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

  it.each(productionFiles)('$path takes only useRpc as a value from the plugin client', ({ text }) => {
    expect(sdkValueImportsBeyondUseRpc(text)).toEqual([])
  })

  it.each(productionFiles)('$path maps no agent status', ({ text }) => {
    expect(statusLiteral.test(text)).toBe(false)
  })

  it.each([
    ["import { x } from '@getpaseo/plugin/server'", ['@getpaseo/plugin/server']],
    ["import { x } from 'node:fs'", ['node:fs']],
    ["import { x } from '@getpaseo/plugin/client/host'", ['@getpaseo/plugin/client/host']],
    ["import { x } from 'react-dom'", ['react-dom']],
    ["import { x } from 'not-react'", ['not-react']],
    ["import { Text } from 'react-native'", []],
    ["import { x } from './use-snapshot-polling.ts'", []],
  ])('import check on %s finds %j', (text, expected) => {
    expect(forbiddenImportsOf(text)).toEqual(expected)
  })

  it.each([
    ["import { useRpc } from '@getpaseo/plugin/client'", []],
    ["import type { PluginWorkspacePanelProps } from '@getpaseo/plugin/client'", []],
    ["import { type PluginWorkspacePanelProps, useRpc } from '@getpaseo/plugin/client'", []],
    ["import { usePaseo } from '@getpaseo/plugin/client'", ['usePaseo']],
    ["import { useRpc, useAgent } from '@getpaseo/plugin/client'", ['useAgent']],
    ["import { getPaseoClient as client } from '@getpaseo/plugin/client'", ['getPaseoClient']],
    ["import * as sdk from '@getpaseo/plugin/client'", ['*']],
    ["import sdk from '@getpaseo/plugin/client'", ['default']],
    ["export { usePaseo } from '@getpaseo/plugin/client'", ['usePaseo']],
    ['const line = `Agent: ${role}`', []],
  ])('SDK import check on %s finds %j', (text, expected) => {
    expect(sdkValueImportsBeyondUseRpc(text)).toEqual(expected)
  })

  it.each([
    ["const label = state === 'idle' ? 'stopped' : state", true],
    ["const label = state === 'Idle' ? 'Stopped' : state", true],
    ["const label = { running: 'Running' }[state]", true],
    ["const label = { idle: 'Stopped' }[state]", true],
    ['const label = { Unknown : 1 }', true],
    ['type Props = { errorColor: string }', false],
    ['const line = `Agent: ${role} (${state})`', false],
    ["const line = 'Agent: dev-a (running)'", false],
  ])('status check on %s finds a status literal: %s', (text, expected) => {
    expect(statusLiteral.test(text)).toBe(expected)
  })
})
