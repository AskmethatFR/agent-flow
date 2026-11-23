import { execFile } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGhRunner, resolveGh } from './ci-status'
import type { ExecFile, ExecFileOptions } from './ci-status'

type Call = { readonly file: string; readonly args: readonly string[]; readonly options: ExecFileOptions }

type Outcome = { readonly error: (Error & { code?: unknown }) | null; readonly stdout: string }

const recording = (outcome: Outcome): { exec: ExecFile; calls: Call[] } => {
  const calls: Call[] = []
  const exec: ExecFile = (file, args, options, callback) => {
    calls.push({ file, args, options })
    callback(outcome.error, outcome.stdout)
    return undefined
  }
  return { exec, calls }
}

const failure = (code: unknown, extra: object = {}): Error & { code?: unknown } =>
  Object.assign(new Error('boom /secret/path'), { code }, extra)

const rollup = '{"headRefOid":"678b2c7355d66c094c072c5dcc2cb8ec26d70c68","statusCheckRollup":[]}'

const gh = '/opt/bin/gh'

describe('createGhRunner', () => {
  it('runs the resolved gh once, with fixed arguments, from the worktree, bounded and non-interactive', async () => {
    const { exec, calls } = recording({ error: null, stdout: rollup })
    await createGhRunner(exec, gh, { PATH: '/bin', GH_PROMPT_DISABLED: '0' })('/work/tree')
    expect(calls).toEqual([
      {
        file: gh,
        args: ['pr', 'view', '--json', 'headRefOid,statusCheckRollup'],
        options: {
          cwd: '/work/tree',
          timeout: 10_000,
          maxBuffer: 1_048_577,
          encoding: 'utf8',
          env: { PATH: '/bin', GH_PROMPT_DISABLED: '1' },
        },
      },
    ])
  })

  it('hands gh only the absolute entries of PATH', async () => {
    const { exec, calls } = recording({ error: null, stdout: rollup })
    const path = ['', '.', 'relative/bin', '/usr/bin', '/bin'].join(delimiter)
    await createGhRunner(exec, gh, { PATH: path })('/work/tree')
    expect(calls[0]?.options.env).toEqual({ PATH: ['/usr/bin', '/bin'].join(delimiter), GH_PROMPT_DISABLED: '1' })
  })

  it('hands back the raw stdout untouched', async () => {
    const { exec } = recording({ error: null, stdout: `${rollup}\n` })
    expect(await createGhRunner(exec, gh, {})('/work/tree')).toEqual({ status: `${rollup}\n` })
  })

  it('reports a missing gh without running anything when none was resolved', async () => {
    const { exec, calls } = recording({ error: null, stdout: rollup })
    expect(await createGhRunner(exec, null, {})('/work/tree')).toEqual({ unavailable: 'gh-missing' })
    expect(calls).toEqual([])
  })

  it('reports a missing gh when the spawn fails with ENOENT', async () => {
    const { exec } = recording({ error: failure('ENOENT'), stdout: '' })
    expect(await createGhRunner(exec, gh, {})('/work/tree')).toEqual({ unavailable: 'gh-missing' })
  })

  const failures: [string, Outcome][] = [
    ['a non-zero exit', { error: failure(1), stdout: '' }],
    ['a timeout', { error: failure(null, { killed: true, signal: 'SIGTERM' }), stdout: '' }],
    ['an output over the buffer', { error: failure('ERR_CHILD_PROCESS_STDIO_MAXBUFFER'), stdout: 'x' }],
    ['an error without a code', { error: new Error('boom'), stdout: '' }],
  ]
  it.each(failures)('reports a gh failure on %s', async (_, outcome) => {
    const { exec } = recording(outcome)
    expect(await createGhRunner(exec, gh, {})('/work/tree')).toEqual({ unavailable: 'gh-failed' })
  })

  it('reports a gh failure when execFile throws', async () => {
    const exploding: ExecFile = () => {
      throw new Error('boom')
    }
    expect(await createGhRunner(exploding, gh, {})('/work/tree')).toEqual({ unavailable: 'gh-failed' })
  })
})

describe('with a gh executable on disk', () => {
  let root: string
  let bin: string
  let worktree: string
  let daemonCwd: string

  // The daemon's own working directory is `root`: a relative, dot or empty PATH entry would resolve
  // there, and `root` holds an executable gh at each of those places (see plantRelativeHits).
  beforeEach(() => {
    daemonCwd = process.cwd()
    root = mkdtempSync(join(tmpdir(), 'ci-status-'))
    bin = join(root, 'bin')
    worktree = join(root, 'worktree')
    mkdirSync(bin)
    mkdirSync(worktree)
    process.chdir(root)
  })

  afterEach(() => {
    process.chdir(daemonCwd)
    rmSync(root, { recursive: true, force: true })
  })

  const fakeGhIn = (dir: string, body: string): string => {
    const path = join(dir, 'gh')
    writeFileSync(path, `#!/bin/sh\n${body}\n`)
    chmodSync(path, 0o755)
    return path
  }

  const unsafeEntries: [string, string][] = [
    ['an empty entry', ''],
    ['a dot entry', '.'],
    ['a relative entry', 'bin'],
  ]

  const plantRelativeHits = (): void => {
    fakeGhIn(root, 'true')
    fakeGhIn(bin, 'true')
  }

  const runGhOf = (path: string) => createGhRunner(execFile, resolveGh({ PATH: path }), { PATH: path })

  describe('resolveGh', () => {
    it('finds the gh of an absolute PATH entry', () => {
      const installed = fakeGhIn(bin, 'true')
      expect(resolveGh({ PATH: bin })).toBe(installed)
    })

    it('takes the first absolute entry holding an executable gh', () => {
      const other = join(root, 'other')
      mkdirSync(other)
      const second = fakeGhIn(other, 'true')
      const first = fakeGhIn(bin, 'true')
      expect(resolveGh({ PATH: [other, bin].join(delimiter) })).toBe(second)
      expect(resolveGh({ PATH: [bin, other].join(delimiter) })).toBe(first)
    })

    it('skips a gh that is not executable and a gh that is a directory', () => {
      const plain = join(root, 'plain')
      const folder = join(root, 'folder')
      mkdirSync(plain)
      mkdirSync(join(folder, 'gh'), { recursive: true })
      writeFileSync(join(plain, 'gh'), 'not executable')
      expect(resolveGh({ PATH: [plain, folder].join(delimiter) })).toBeNull()
    })

    it('finds nothing without PATH or on an empty PATH', () => {
      expect(resolveGh({})).toBeNull()
      expect(resolveGh({ PATH: '' })).toBeNull()
    })

    it.each(unsafeEntries)('never looks at %s, although it resolves to an executable gh', (_, entry) => {
      plantRelativeHits()
      expect(resolveGh({ PATH: entry })).toBeNull()
      expect(resolveGh({ PATH: [entry, bin].join(delimiter) })).toBe(join(bin, 'gh'))
    })
  })

  it('reads the stdout of gh run in the worktree', async () => {
    fakeGhIn(bin, 'printf "%s|%s|%s" "$*" "$(pwd -P)" "$GH_PROMPT_DISABLED"')
    const read = await runGhOf(bin)(worktree)
    expect(read).toEqual({ status: `pr view --json headRefOid,statusCheckRollup|${worktree}|1` })
  })

  it('reports a gh that exits with a failure', async () => {
    fakeGhIn(bin, 'echo "gh: not logged in" >&2; exit 4')
    expect(await runGhOf(bin)(worktree)).toEqual({ unavailable: 'gh-failed' })
  })

  it('reports a gh that is not on PATH', async () => {
    expect(await runGhOf(bin)(worktree)).toEqual({ unavailable: 'gh-missing' })
  })

  describe('a gh planted where an unsafe PATH entry resolves', () => {
    const markerIn = (dir: string): string => join(dir, 'planted-ran')

    const plantEverywhere = (): void => {
      for (const dir of [root, bin, worktree]) fakeGhIn(dir, `: > '${markerIn(dir)}'; echo planted`)
    }

    const planted = (): string[] =>
      [root, bin, worktree].flatMap((dir) => (existsSync(markerIn(dir)) ? [dir] : []))

    it.each(unsafeEntries)(
      'never runs through %s of PATH, and gh is reported missing',
      async (_, entry) => {
        plantEverywhere()
        const read = await runGhOf(entry)(worktree)
        expect(read).toEqual({ unavailable: 'gh-missing' })
        expect(planted()).toEqual([])
      },
    )

    it('never runs when the real gh sits behind unsafe entries, the absolute one runs instead', async () => {
      plantEverywhere()
      const absolute = join(root, 'absolute')
      mkdirSync(absolute)
      fakeGhIn(absolute, 'printf real')
      const path = ['', '.', 'bin', absolute].join(delimiter)
      expect(await runGhOf(path)(worktree)).toEqual({ status: 'real' })
      expect(planted()).toEqual([])
    })
  })
})
