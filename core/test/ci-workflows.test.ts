import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const workflowsDir = fileURLToPath(new URL('../../.github/workflows/', import.meta.url))
const readWorkflow = (file: string): string => readFileSync(`${workflowsDir}${file}`, 'utf8')
const actionRefs = (text: string): string[] => [...text.matchAll(/uses: ([^\s#]+)/g)].map((match) => match[1] ?? '')

const PINNED_ACTIONS = [
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1',
]

describe.each(['ci', 'bdd'])('%s workflow', (name) => {
  const text = readWorkflow(`${name}.yml`)

  it('starts on pull requests and on pushes to main', () => {
    expect(text).toContain('on:\n  pull_request:\n  push:\n    branches: [main]\n')
  })

  it('gives each push to main its own concurrency group and cancels only pull request runs', () => {
    const concurrency = [
      'concurrency:',
      `  group: ${name}-\${{ github.event_name == 'pull_request' && github.ref || github.run_id }}`,
      `  cancel-in-progress: \${{ github.event_name == 'pull_request' }}`,
      '',
    ].join('\n')
    expect(text).toContain(concurrency)
  })

  it('keeps read-only permissions and reads no secret or new token', () => {
    expect(text).toContain('permissions:\n  contents: read\n')
    expect(text).not.toMatch(/secrets\.|id-token|: write/)
  })

  it('uses only the two actions already pinned to a commit SHA', () => {
    expect(actionRefs(text)).toEqual(PINNED_ACTIONS)
  })
})
