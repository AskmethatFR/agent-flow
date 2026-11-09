import {
  closeSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validatePlan } from '@agent-flow/core/contracts'
import { seedPlan } from './index'
import { createPlanSeeder } from './plan-seed'
import type { PlanSeederIo } from './plan-seed'

const issue = '78'
const title = 'Seed plan.json on real runs'
const seededText = `${JSON.stringify({ issue: '#78', title, steps: [] }, null, 2)}\n`

const refused = (message: string, field: string | null = null) => ({
  accepted: false,
  errors: [{ file: 'plan.json', location: null, field, message }],
})

let root: string
let worktree: string
let agentFlow: string
let planPath: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'plan-seed-')))
  worktree = join(root, 'worktree')
  agentFlow = join(worktree, '.agent-flow')
  planPath = join(agentFlow, 'plan.json')
  mkdirSync(worktree)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const realIo: PlanSeederIo = {
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  linkSync,
  unlinkSync,
  readSync,
  temporaryName: () => 'fixed',
}

const seederWith = (overrides: Partial<PlanSeederIo>) => createPlanSeeder({ ...realIo, ...overrides })

const failure = (): never => {
  throw new Error('injected fault')
}

const givenPlan = (text: string): void => {
  mkdirSync(agentFlow, { recursive: true })
  writeFileSync(planPath, text)
}

const recordingIo = (calls: string[]): Partial<PlanSeederIo> => ({
  openSync: ((...args: Parameters<typeof openSync>) => {
    calls.push('open')
    return openSync(...args)
  }) as typeof openSync,
  fsyncSync: (fd) => {
    calls.push('fsync')
    fsyncSync(fd)
  },
  closeSync: (fd) => {
    calls.push('close')
    closeSync(fd)
  },
  linkSync: (from, to) => {
    calls.push(`link ${String(from).split('/').pop()} -> ${String(to).split('/').pop()}`)
    linkSync(from, to)
  },
  unlinkSync: (path) => {
    calls.push(`unlink ${String(path).split('/').pop()}`)
    unlinkSync(path)
  },
})

describe('seedPlan', () => {
  describe('creating the plan', () => {
    it('creates .agent-flow and an empty plan that passes the contract', () => {
      const result = seedPlan(worktree, issue, title)

      expect(result).toEqual({ accepted: true })
      expect(readFileSync(planPath, 'utf8')).toBe(seededText)
      expect(validatePlan(readFileSync(planPath, 'utf8'))).toEqual({ accepted: true })
      expect(readdirSync(agentFlow)).toEqual(['plan.json'])
    })

    it('writes into an .agent-flow directory that already exists', () => {
      mkdirSync(agentFlow)
      writeFileSync(join(agentFlow, 'decisions.jsonl'), 'kept\n')

      expect(seedPlan(worktree, issue, title)).toEqual({ accepted: true })
      expect(readdirSync(agentFlow).sort()).toEqual(['decisions.jsonl', 'plan.json'])
      expect(readFileSync(join(agentFlow, 'decisions.jsonl'), 'utf8')).toBe('kept\n')
    })

    it('gives the plan the default permissions of a new file', () => {
      seedPlan(worktree, issue, title)

      expect(statSync(planPath).mode & 0o777).toBe(0o666 & ~process.umask())
    })

    it('writes the whole plan when the file system accepts only seven bytes at a time', () => {
      const sevenBytesAtATime = ((fd: number, buffer: Uint8Array, offset: number) =>
        writeSync(fd, buffer, offset, Math.min(7, buffer.length - offset))) as typeof writeSync

      const result = seederWith({ writeSync: sevenBytesAtATime })(worktree, issue, title)

      expect(result).toEqual({ accepted: true })
      expect(readFileSync(planPath, 'utf8')).toBe(seededText)
    })

    it('syncs and closes the temporary file, links it to plan.json, then removes it', () => {
      const calls: string[] = []

      seederWith(recordingIo(calls))(worktree, issue, title)

      expect(calls).toEqual([
        'open',
        'fsync',
        'close',
        'link .plan.json.fixed.tmp -> plan.json',
        'unlink .plan.json.fixed.tmp',
      ])
    })

    it('reports the plan as created when removing the temporary file fails after the link published it', () => {
      const result = seederWith({ unlinkSync: failure })(worktree, issue, title)

      expect(result).toEqual({ accepted: true })
      expect(readFileSync(planPath, 'utf8')).toBe(seededText)
    })
  })

  describe('never replacing a plan', () => {
    it('refuses an existing plan, keeps its bytes and leaves no temporary file', () => {
      givenPlan('{"existing":true}')

      const result = seedPlan(worktree, issue, title)

      expect(result).toEqual(refused('already exists'))
      expect(readFileSync(planPath, 'utf8')).toBe('{"existing":true}')
      expect(readdirSync(agentFlow)).toEqual(['plan.json'])
    })

    it('removes its temporary file before answering already exists', () => {
      givenPlan('{}')
      const calls: string[] = []

      seederWith(recordingIo(calls))(worktree, issue, title)

      expect(calls.filter((call) => call.startsWith('unlink'))).toEqual(['unlink .plan.json.fixed.tmp'])
    })

    it('answers already exists even when removing the temporary file fails', () => {
      givenPlan('{}')

      const result = seederWith({ unlinkSync: failure })(worktree, issue, title)

      expect(result).toEqual(refused('already exists'))
    })

    it('refuses a plan.json that is a dangling symlink without writing through it', () => {
      mkdirSync(agentFlow)
      const target = join(root, 'outside.json')
      symlinkSync(target, planPath)

      const result = seedPlan(worktree, issue, title)

      expect(result).toEqual(refused('already exists'))
      expect(() => readFileSync(target)).toThrow()
      expect(readdirSync(agentFlow)).toEqual(['plan.json'])
    })

    it('refuses a plan.json that is a directory', () => {
      mkdirSync(planPath, { recursive: true })

      expect(seedPlan(worktree, issue, title)).toEqual(refused('already exists'))
    })

    it.each<[string, string]>([
      ['another issue', JSON.stringify({ issue: '#34', title: 'Plan writer', steps: [] })],
      ['an issue sharing only a prefix', JSON.stringify({ issue: '#780', title, steps: [] })],
      ['the same issue but breaks the contract', JSON.stringify({ issue: '#78' })],
      ['no issue', '{}'],
      ['a JSON null', 'null'],
      ['text that is not JSON', 'not json'],
    ])('refuses a plan that names %s and keeps its bytes', (_name, existing) => {
      givenPlan(existing)

      expect(seedPlan(worktree, issue, title)).toEqual(refused('already exists'))
      expect(readFileSync(planPath, 'utf8')).toBe(existing)
    })

    it('refuses a symlinked plan.json even when its target names the same issue', () => {
      mkdirSync(agentFlow)
      const target = join(root, 'same-issue.json')
      writeFileSync(target, JSON.stringify({ issue: '#78', title, steps: [] }))
      symlinkSync(target, planPath)

      expect(seedPlan(worktree, issue, title)).toEqual(refused('already exists'))
    })
  })

  describe('a plan that already names the same issue', () => {
    const existing = JSON.stringify({ issue: '#78', title: 'Another title', steps: [] })

    it('accepts the seed and keeps the bytes without a temporary file', () => {
      givenPlan(existing)

      expect(seedPlan(worktree, issue, title)).toEqual({ accepted: true })
      expect(readFileSync(planPath, 'utf8')).toBe(existing)
      expect(readdirSync(agentFlow)).toEqual(['plan.json'])
    })

    it('still reports a write failure that is not an existing plan', () => {
      givenPlan(existing)

      expect(seederWith({ linkSync: failure })(worktree, issue, title)).toEqual(refused('cannot be written'))
    })

    it('refuses to trust a plan whose .agent-flow was swapped for a link after the plan was found', () => {
      givenPlan(existing)
      const moved = join(root, 'moved')
      const swapAfterFound = ((from: string, to: string) => {
        renameSync(agentFlow, moved)
        symlinkSync(moved, agentFlow)
        linkSync(from, to)
      }) as typeof linkSync

      const result = seederWith({ linkSync: swapAfterFound })(worktree, issue, title)

      expect(result).toEqual(refused('.agent-flow must be a real directory'))
    })

    it('accepts it when the seed is retried after a first success', () => {
      seedPlan(worktree, issue, title)

      expect(seedPlan(worktree, issue, title)).toEqual({ accepted: true })
      expect(readFileSync(planPath, 'utf8')).toBe(seededText)
    })
  })

  describe('refusing what the contract refuses', () => {
    it.each<[string, string, string, string]>([
      ['an issue that is not a number', 'abc', title, 'issue'],
      ['a blank title', issue, '   ', 'title'],
    ])('refuses %s and writes nothing', (_name, issueArgument, titleArgument, field) => {
      const result = seedPlan(worktree, issueArgument, titleArgument)

      expect(result.accepted).toBe(false)
      if (result.accepted) return
      expect(result.errors[0]).toMatchObject({ file: 'plan.json', field })
      expect(readdirSync(worktree)).toEqual([])
    })
  })

  describe('confinement to .agent-flow', () => {
    const worktreeMessage = 'worktree must be an absolute path without . or .. segments'

    it.each<[string, () => unknown]>([
      ['a relative path', () => 'worktree'],
      ['an empty path', () => ''],
      ['a non-string', () => 42],
      ['a path going through ..', () => `${worktree}/../worktree`],
      ['a path with a . segment', () => `${root}/./worktree`],
    ])('refuses a worktree given as %s and writes nothing', (_name, argument) => {
      const result = seedPlan(argument() as string, issue, title)

      expect(result).toEqual(refused(worktreeMessage))
      expect(readdirSync(worktree)).toEqual([])
    })

    it('refuses a worktree that cannot be resolved', () => {
      expect(seedPlan(join(root, 'absent'), issue, title)).toEqual(refused('worktree cannot be resolved'))
    })

    it('refuses a worktree that is a plain file', () => {
      const file = join(root, 'plain-file')
      writeFileSync(file, 'x')

      expect(seedPlan(file, issue, title)).toEqual(refused('.agent-flow cannot be read'))
    })

    it('follows a symlinked worktree to the real one, which is the caller choice', () => {
      const link = join(root, 'link-to-worktree')
      symlinkSync(worktree, link)

      expect(seedPlan(link, issue, title)).toEqual({ accepted: true })
      expect(readFileSync(planPath, 'utf8')).toBe(seededText)
    })

    it('refuses a symlinked .agent-flow whatever it points to, and writes nothing', () => {
      const outside = join(root, 'outside')
      mkdirSync(outside)
      symlinkSync(outside, agentFlow)

      const result = seedPlan(worktree, issue, title)

      expect(result).toEqual(refused('.agent-flow must be a real directory'))
      expect(readdirSync(outside)).toEqual([])
    })

    it('refuses a .agent-flow that is a plain file without replacing it', () => {
      writeFileSync(agentFlow, 'plain')

      const result = seedPlan(worktree, issue, title)

      expect(result).toEqual(refused('.agent-flow must be a real directory'))
      expect(readFileSync(agentFlow, 'utf8')).toBe('plain')
    })

    it('refuses to publish when an ancestor of .agent-flow was swapped for a link mid-write', () => {
      const moved = join(root, 'moved')
      const swapAncestor = ((...args: Parameters<typeof writeSync>) => {
        renameSync(worktree, moved)
        symlinkSync(moved, worktree)
        return writeSync(...args)
      }) as typeof writeSync

      const result = seederWith({ writeSync: swapAncestor })(worktree, issue, title)

      expect(result).toEqual(refused('cannot be written'))
      expect(readdirSync(join(moved, '.agent-flow'))).toEqual([])
    })
  })

  describe('atomic write', () => {
    it.each<[string, Partial<PlanSeederIo>]>([
      [
        'a write that stops halfway',
        {
          writeSync: ((fd: number, buffer: Uint8Array, offset: number) => {
            writeSync(fd, buffer, offset, 5)
            throw new Error('injected fault')
          }) as unknown as typeof writeSync,
        },
      ],
      ['a failing fsync', { fsyncSync: failure }],
      ['a failing close', { closeSync: failure }],
      ['a failing link', { linkSync: failure }],
      [
        'a failing temporary file creation',
        {
          openSync: ((...args: Parameters<typeof openSync>) =>
            String(args[0]).endsWith('.tmp') ? failure() : openSync(...args)) as typeof openSync,
        },
      ],
    ])('creates no plan and leaves no temporary file after %s', (_name, fault) => {
      const result = seederWith(fault)(worktree, issue, title)

      expect(result).toEqual(refused('cannot be written'))
      expect(readdirSync(agentFlow)).toEqual([])
    })

    it('still answers cannot be written when the cleanup itself fails', () => {
      const result = seederWith({ linkSync: failure, unlinkSync: failure, closeSync: failure })(
        worktree,
        issue,
        title,
      )

      expect(result).toEqual(refused('cannot be written'))
    })

    it('does not remove a temporary file it never created', () => {
      mkdirSync(agentFlow)
      writeFileSync(join(agentFlow, '.plan.json.fixed.tmp'), 'someone else')

      const result = seederWith({})(worktree, issue, title)

      expect(result).toEqual(refused('cannot be written'))
      expect(readFileSync(join(agentFlow, '.plan.json.fixed.tmp'), 'utf8')).toBe('someone else')
    })

    it('refuses to write through a temporary name planted as a symlink to an outside file', () => {
      mkdirSync(agentFlow)
      const target = join(root, 'outside.json')
      symlinkSync(target, join(agentFlow, '.plan.json.fixed.tmp'))

      const result = seederWith({})(worktree, issue, title)

      expect(result).toEqual(refused('cannot be written'))
      expect(() => readFileSync(target)).toThrow()
    })
  })
})
