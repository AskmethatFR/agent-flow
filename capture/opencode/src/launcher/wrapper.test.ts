import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const repo = fileURLToPath(new URL('../../../../', import.meta.url))
const launcher = join(repo, 'rules/opencode/agent-flow-opencode')

const hostileArguments = ['run', '--standalone', 'two words', '', '$HOME', '*', '--', '-x', "it's", 'line\nbreak']

let root: string
let bin: string
let elsewhere: string
let record: string

const installFakeOpencode = (status: number): void => {
  writeFileSync(
    join(bin, 'opencode'),
    `#!/bin/sh\n: > '${record}'\nfor argument in "$@"; do printf '%s\\0' "$argument" >> '${record}'; done\necho $$ > '${record}.pid'\nexit ${status}\n`,
    { mode: 0o755 },
  )
}

const launch = (home: string | undefined, args: readonly string[] = hostileArguments, extraEnv: NodeJS.ProcessEnv = {}) =>
  spawnSync(launcher, [...args], {
    cwd: elsewhere,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, AGENT_FLOW_HOME: home, ...extraEnv },
  })

const recordedArguments = (): string[] => readFileSync(record, 'utf8').split('\0').slice(0, -1)

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'opencode-launcher-')))
  bin = join(root, 'bin')
  elsewhere = join(root, 'elsewhere')
  record = join(root, 'record')
  mkdirSync(bin)
  mkdirSync(elsewhere)
  installFakeOpencode(0)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('the OpenCode launcher shim', { timeout: 30_000 }, () => {
  it.each([
    ['unset', () => undefined],
    ['empty', () => ''],
    ['another checkout', () => elsewhere],
    ['a path that does not exist', () => join(root, 'no-such-checkout')],
    ['relative', () => 'rules'],
  ])('refuses without starting OpenCode when AGENT_FLOW_HOME is %s', (_state, homeOf) => {
    const home = homeOf()
    const result = launch(home)
    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toMatch(/^[^\n]+\n$/)
    expect(result.stderr).toContain('AGENT_FLOW_HOME')
    if (home) expect(result.stderr).not.toContain(home)
    expect(existsSync(record)).toBe(false)
  })

  it.each([
    ['exactly', () => repo],
    ['through a symlink', () => {
      const link = join(root, 'checkout-link')
      symlinkSync(repo, link)
      return link
    }],
  ])('starts OpenCode with every argument unchanged when AGENT_FLOW_HOME names the checkout %s', (_reference, homeOf) => {
    const result = launch(homeOf())
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(recordedArguments()).toEqual(hostileArguments)
  })

  it('starts OpenCode with no argument when none is given', () => {
    const result = launch(repo, [])
    expect(result.status).toBe(0)
    expect(recordedArguments()).toEqual([])
  })

  it('returns the exit status of OpenCode', () => {
    installFakeOpencode(7)
    expect(launch(repo).status).toBe(7)
  })

  it('replaces itself with OpenCode instead of supervising it', () => {
    const result = launch(repo)
    expect(Number(readFileSync(`${record}.pid`, 'utf8'))).toBe(result.pid)
  })

  it('keeps the tsx cache out of the shared temporary directory', () => {
    const scratch = join(root, 'scratch-tmp')
    mkdirSync(scratch)
    const result = launch(repo, hostileArguments, { TMPDIR: scratch })
    expect(result.status).toBe(0)
    const cached = readdirSync(scratch, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
    expect(cached.map((entry) => join(entry.parentPath, entry.name))).toEqual([])
  })

  it('passes its own tsconfig.json to tsx whatever tsx would otherwise pick up', () => {
    writeFileSync(join(elsewhere, 'tsconfig.json'), JSON.stringify({ extends: './no-such-base.json' }))
    const result = launch(repo, hostileArguments, { TSX_TSCONFIG_PATH: join(elsewhere, 'tsconfig.json') })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(recordedArguments()).toEqual(hostileArguments)
  })
})
