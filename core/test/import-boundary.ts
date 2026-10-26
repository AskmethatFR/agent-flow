import { readFileSync, readdirSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import ts from 'typescript'

export type SourceFile = { readonly path: string; readonly text: string }

export type BoundaryRule = 'sibling-workspace' | 'host-package' | 'react-native' | 'node-builtin'

export type BoundaryViolation = {
  readonly file: string
  readonly specifier: string
  readonly rule: BoundaryRule
}

const SIBLING_PACKAGE = /^@agent-flow\/(daemon|panel|capture-)/
const SOURCE_EXTENSION = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const HOST_PACKAGE = /paseo|opencode/i
const REACT_NATIVE_PACKAGE = /^(react-native(-.+)?|@react-native(-[^/]+)?\/.+)$/
const SIBLING_FOLDERS = ['daemon', 'panel', 'capture']

const packageName = (specifier: string): string => {
  const segments = specifier.split('/')
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : (segments[0] ?? specifier)
}

const isRelative = (specifier: string): boolean => specifier.startsWith('.')

const resolvesIntoSiblingFolder = (file: SourceFile, specifier: string, repoRoot: string): boolean => {
  const target = resolve(dirname(file.path), specifier)
  return SIBLING_FOLDERS.some((folder) => {
    const folderPath = resolve(repoRoot, folder)
    return target === folderPath || target.startsWith(folderPath + sep)
  })
}

const ruleBroken = (file: SourceFile, specifier: string, repoRoot: string): BoundaryRule | undefined => {
  if (isRelative(specifier)) {
    return resolvesIntoSiblingFolder(file, specifier, repoRoot) ? 'sibling-workspace' : undefined
  }
  const name = packageName(specifier)
  if (SIBLING_PACKAGE.test(name)) return 'sibling-workspace'
  if (HOST_PACKAGE.test(name)) return 'host-package'
  if (REACT_NATIVE_PACKAGE.test(name)) return 'react-native'
  if (isBuiltin(specifier)) return 'node-builtin'
  return undefined
}

export function readSourceFiles(dir: string): SourceFile[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return readSourceFiles(path)
    return SOURCE_EXTENSION.test(entry.name) ? [{ path, text: readFileSync(path, 'utf8') }] : []
  })
}

export function findBoundaryViolations(
  files: readonly SourceFile[],
  repoRoot: string,
): BoundaryViolation[] {
  return files.flatMap((file) =>
    ts
      .preProcessFile(file.text, true, true)
      .importedFiles.map(({ fileName }) => fileName)
      .flatMap((specifier) => {
        const rule = ruleBroken(file, specifier, repoRoot)
        return rule ? [{ file: file.path, specifier, rule }] : []
      }),
  )
}
