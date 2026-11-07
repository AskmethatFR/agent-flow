import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const binDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin')

const hostileTsconfig = JSON.stringify({
  compilerOptions: { paths: { '@agent-flow/*': ['./planted.ts'] } },
})

let hostileCwd: string

beforeEach(() => {
  hostileCwd = realpathSync(mkdtempSync(join(tmpdir(), 'launcher-hostile-cwd-')))
  writeFileSync(join(hostileCwd, 'tsconfig.json'), hostileTsconfig)
  writeFileSync(join(hostileCwd, 'planted.ts'), 'export const planted = true\n')
})

afterEach(() => {
  rmSync(hostileCwd, { recursive: true, force: true })
})

describe.each(['agent-flow-plan', 'agent-flow-decision', 'agent-flow-check'])(
  '%s launcher',
  (name) => {
    it(
      'ignores the tsconfig.json of its working directory and prints its usage',
      { timeout: 30_000 },
      () => {
        const result = spawnSync(process.execPath, [join(binDirectory, `${name}.mjs`)], {
          cwd: hostileCwd,
          encoding: 'utf8',
          timeout: 25_000,
        })

        expect(result.stderr).toMatch(new RegExp(`^usage: ${name} `))
        expect(result.status).toBe(2)
      },
    )
  },
)
