import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
})
