import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const clientSource = fileURLToPath(new URL('.', import.meta.url))

const productionFiles = readdirSync(clientSource, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.startsWith('testing'))
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
    expect(productionFiles.map((file) => file.path)).toContain('plan-rail.tsx')
  })

  it.each(productionFiles)('$path computes no time', ({ text }) => {
    expect(computationTokens.filter((token) => text.includes(token))).toEqual([])
  })
})
