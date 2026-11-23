import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { passingRollupOf } from '../steps/passing-ci.ts'

const headCommit = '678b2c7355d66c094c072c5dcc2cb8ec26d70c68'

// The daemon resolves gh once, when its wiring module loads, and reports gh missing when it finds
// none. This double is evaluated before that module body, so an executable gh that is never run
// (execFile below answers instead) keeps the harness independent of the machine's gh.
const installed = mkdtempSync(join(tmpdir(), 'gh-double-'))
writeFileSync(join(installed, 'gh'), '', { mode: 0o755 })
process.env.PATH = `${installed}${delimiter}${process.env.PATH ?? ''}`
process.on('exit', () => rmSync(installed, { recursive: true, force: true }))

export const execFile = (
  _file: string,
  _args: readonly string[],
  _options: unknown,
  callback: (error: null, stdout: string) => void,
): void => {
  callback(null, passingRollupOf(headCommit))
}
