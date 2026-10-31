import { execFileSync } from 'node:child_process'
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  appendFileSync,
  chmodSync,
  readSync,
  readdirSync,
  readlinkSync,
  statSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyStepEvent } from './index'
import { createPlanWriter } from './plan-writer'
import type { PlanWriterIo } from './plan-writer'

const startedAt = '2026-01-01T10:00:00.000Z'

const stepOf = (id: string, overlays: Record<string, unknown> = {}) => ({
  id,
  title: 'Implementation',
  role: 'dev-a',
  status: 'todo',
  origin: 'planned',
  startedAt: null,
  endedAt: null,
  ...overlays,
})

const planWith = (steps: readonly unknown[]): string =>
  JSON.stringify({ issue: '#34', title: 'Plan writer', steps })

const missing = (message: string, field: string | null = null) => ({
  accepted: false,
  errors: [{ file: 'plan.json', location: null, field, message }],
})

let root: string
let worktree: string
let agentFlow: string
let planPath: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'plan-writer-unit-')))
  worktree = join(root, 'worktree')
  agentFlow = join(worktree, '.agent-flow')
  planPath = join(agentFlow, 'plan.json')
  mkdirSync(worktree)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const givenPlan = (plan: string): void => {
  mkdirSync(agentFlow, { recursive: true })
  writeFileSync(planPath, plan)
}

const stepsOnDisk = (): Record<string, unknown>[] => JSON.parse(readFileSync(planPath, 'utf8')).steps

const realIo: PlanWriterIo = {
  openSync,
  readSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
  temporaryName: () => 'fixed',
}

const writerWith = (overrides: Partial<PlanWriterIo>) => createPlanWriter({ ...realIo, ...overrides })

const failure = (): never => {
  throw new Error('injected fault')
}

const startOfS1 = { kind: 'start', stepId: 's1', at: startedAt } as const

const recordingIo = (calls: string[]): Partial<PlanWriterIo> => ({
  openSync: ((...args: Parameters<typeof openSync>) => {
    calls.push('open')
    return openSync(...args)
  }) as typeof openSync,
  writeSync: ((...args: Parameters<typeof writeSync>) => {
    calls.push('write')
    return writeSync(...args)
  }) as typeof writeSync,
  fsyncSync: (fd) => {
    calls.push('fsync')
    fsyncSync(fd)
  },
  closeSync: (fd) => {
    calls.push('close')
    closeSync(fd)
  },
  unlinkSync: (path) => {
    calls.push('unlink')
    unlinkSync(path)
  },
  renameSync: (from, to) => {
    calls.push(`rename ${String(from).split('/').pop()} -> ${String(to).split('/').pop()}`)
    renameSync(from, to)
  },
})

const failingOnTemporaryFile = ((...args: Parameters<typeof openSync>) =>
  String(args[0]).endsWith('.tmp') ? failure() : openSync(...args)) as typeof openSync

const partialWrite = ((fd: number, buffer: Uint8Array, offset: number) => {
  writeSync(fd, buffer, offset, 5)
  throw new Error('injected fault')
}) as unknown as typeof writeSync

const sevenBytesAtATime = ((fd: number, buffer: Uint8Array, offset: number) =>
  writeSync(fd, buffer, offset, Math.min(7, buffer.length - offset))) as typeof writeSync

describe('applyStepEvent', () => {
  describe('applying events to plan.json', () => {
    it('writes a started step back and reports acceptance', () => {
      givenPlan(planWith([stepOf('s1')]))

      const result = applyStepEvent(worktree, { kind: 'start', stepId: 's1', at: startedAt })

      expect(result).toEqual({ accepted: true })
      expect(stepsOnDisk()).toEqual([stepOf('s1', { status: 'in_progress', startedAt })])
    })

    it('writes a finished step back and reports acceptance', () => {
      const endedAt = '2026-01-01T11:00:00.000Z'
      givenPlan(planWith([stepOf('s1', { status: 'in_progress', startedAt })]))

      const result = applyStepEvent(worktree, { kind: 'finish', stepId: 's1', at: endedAt })

      expect(result).toEqual({ accepted: true })
      expect(stepsOnDisk()).toEqual([stepOf('s1', { status: 'done', startedAt, endedAt })])
    })

    it('returns the lifecycle refusal untouched and leaves plan.json byte-identical', () => {
      const plan = planWith([stepOf('s1')])
      givenPlan(plan)

      const result = applyStepEvent(worktree, { kind: 'start', stepId: 's9', at: startedAt })

      expect(result).toEqual({
        accepted: false,
        errors: [{ file: 'plan.json', location: 's9', field: 'id', message: 'is not a step of this plan' }],
      })
      expect(readFileSync(planPath, 'utf8')).toBe(plan)
    })

    it('refuses an event kind other than start or finish before touching the disk', () => {
      const result = applyStepEvent(worktree, { kind: 'pause', stepId: 's1', at: startedAt } as never)

      expect(result).toEqual(missing('must be start or finish', 'kind'))
      expect(readdirSync(worktree)).toEqual([])
    })

    it.each<[string, unknown]>([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'start'],
      ['a number', 42],
    ])('refuses an event that is %s instead of throwing', (_name, event) => {
      const result = applyStepEvent(worktree, event as never)

      expect(result).toEqual(missing('must be start or finish', 'kind'))
      expect(readdirSync(worktree)).toEqual([])
    })

    it.each<[string, Record<string, unknown>]>([
      ['a step id that is not a string', { kind: 'start', stepId: 42, at: startedAt }],
      ['an instant that is not a string', { kind: 'start', stepId: 's1', at: 7 }],
    ])('refuses %s through the lifecycle and leaves plan.json byte-identical', (_name, event) => {
      const plan = planWith([stepOf('s1')])
      givenPlan(plan)

      const result = applyStepEvent(worktree, event as never)

      expect(result.accepted).toBe(false)
      expect(readFileSync(planPath, 'utf8')).toBe(plan)
    })
  })

  describe('permissions', () => {
    it('keeps the permission bits of the plan it replaces', () => {
      givenPlan(planWith([stepOf('s1')]))
      chmodSync(planPath, 0o600)

      const result = applyStepEvent(worktree, startOfS1)

      expect(result).toEqual({ accepted: true })
      expect(statSync(planPath).mode & 0o777).toBe(0o600)
    })
  })

  describe('atomic write', () => {
    it.each<[string, Partial<PlanWriterIo>]>([
      ['a write that stops halfway', { writeSync: partialWrite }],
      ['a failing fsync', { fsyncSync: failure }],
      ['a failing close', { closeSync: failure }],
      ['a failing rename', { renameSync: failure }],
      ['a failing temporary file creation', { openSync: failingOnTemporaryFile }],
    ])('keeps the previous plan and leaves no temporary file after %s', (_name, fault) => {
      const plan = planWith([stepOf('s1')])
      givenPlan(plan)

      const result = writerWith(fault)(worktree, startOfS1)

      expect(result).toEqual(missing('cannot be written'))
      expect(readFileSync(planPath, 'utf8')).toBe(plan)
      expect(readdirSync(agentFlow)).toEqual(['plan.json'])
    })

    it('still answers cannot be written when the cleanup itself fails', () => {
      givenPlan(planWith([stepOf('s1')]))

      const result = writerWith({ renameSync: failure, unlinkSync: failure, closeSync: failure })(
        worktree,
        startOfS1,
      )

      expect(result).toEqual(missing('cannot be written'))
    })

    it('writes the whole plan when the file system accepts only seven bytes at a time', () => {
      givenPlan(planWith([stepOf('s1')]))

      const result = writerWith({ writeSync: sevenBytesAtATime })(worktree, startOfS1)

      expect(result).toEqual({ accepted: true })
      expect(stepsOnDisk()).toEqual([stepOf('s1', { status: 'in_progress', startedAt })])
    })

    it('syncs and closes the temporary file before renaming it over plan.json', () => {
      const calls: string[] = []
      givenPlan(planWith([stepOf('s1')]))

      writerWith(recordingIo(calls))(worktree, startOfS1)

      const writes = calls.filter((call) => call === 'write')
      expect(writes.length).toBeGreaterThan(0)
      expect(calls.filter((call) => call !== 'write')).toEqual([
        'open',
        'close',
        'open',
        'fsync',
        'close',
        'rename .plan.json.fixed.tmp -> plan.json',
      ])
      expect(readdirSync(agentFlow)).toEqual(['plan.json'])
    })

    it('closes and removes the temporary file when the sync fails', () => {
      const calls: string[] = []
      givenPlan(planWith([stepOf('s1')]))

      writerWith({ ...recordingIo(calls), fsyncSync: failure })(worktree, startOfS1)

      expect(calls.filter((call) => call === 'close')).toHaveLength(2)
      expect(calls.filter((call) => call === 'unlink')).toHaveLength(1)
    })

    it('closes only the plan it read and removes nothing when the temporary file could not be created', () => {
      const calls: string[] = []
      givenPlan(planWith([stepOf('s1')]))

      writerWith({ ...recordingIo(calls), openSync: failingOnTemporaryFile })(worktree, startOfS1)

      expect(calls.filter((call) => call === 'close' || call === 'unlink')).toEqual(['close'])
    })

    it('does not remove a temporary file it never created', () => {
      givenPlan(planWith([stepOf('s1')]))
      writeFileSync(join(agentFlow, '.plan.json.fixed.tmp'), 'someone else')

      const result = writerWith({})(worktree, startOfS1)

      expect(result).toEqual(missing('cannot be written'))
      expect(readFileSync(join(agentFlow, '.plan.json.fixed.tmp'), 'utf8')).toBe('someone else')
    })
  })

  describe('confinement to .agent-flow', () => {
    const outside = (): string => join(root, 'outside')
    const outsidePlan = planWith([stepOf('s1')])
    const worktreeMessage = 'worktree must be an absolute path without . or .. segments'

    const givenOutsidePlan = (): string => {
      const target = join(outside(), 'plan.json')
      mkdirSync(outside())
      writeFileSync(target, outsidePlan)
      return target
    }

    const expectOutsideUntouched = (): void => {
      expect(readFileSync(join(outside(), 'plan.json'), 'utf8')).toBe(outsidePlan)
      expect(readdirSync(outside())).toEqual(['plan.json'])
    }

    it.each<[string, () => unknown]>([
      ['a relative path', () => 'worktree'],
      ['an empty path', () => ''],
      ['a non-string', () => 42],
      ['a path going through ..', () => `${worktree}/../outside`],
      ['a path with a . segment', () => `${root}/./worktree`],
    ])('refuses a worktree given as %s and writes nothing', (_name, argument) => {
      givenOutsidePlan()
      const plan = planWith([stepOf('s1')])
      givenPlan(plan)

      const result = applyStepEvent(argument() as string, startOfS1)

      expect(result).toEqual(missing(worktreeMessage))
      expectOutsideUntouched()
      expect(readFileSync(planPath, 'utf8')).toBe(plan)
    })

    it('refuses a worktree that cannot be resolved', () => {
      const result = applyStepEvent(join(root, 'absent'), startOfS1)

      expect(result).toEqual(missing('worktree cannot be resolved'))
    })

    it('refuses a worktree that is a plain file because .agent-flow cannot be inspected', () => {
      const file = join(root, 'plain-file')
      writeFileSync(file, 'x')

      const result = applyStepEvent(file, startOfS1)

      expect(result).toEqual(missing('cannot be read'))
    })

    it('accepts a worktree whose directory name merely contains dots', () => {
      const dotted = join(root, '.hidden.worktree')
      mkdirSync(join(dotted, '.agent-flow'), { recursive: true })
      writeFileSync(join(dotted, '.agent-flow', 'plan.json'), planWith([stepOf('s1')]))

      const result = applyStepEvent(dotted, startOfS1)

      expect(result).toEqual({ accepted: true })
    })

    it('follows a symlinked worktree to the real one, which is the caller choice', () => {
      givenPlan(planWith([stepOf('s1')]))
      const link = join(root, 'link-to-worktree')
      symlinkSync(worktree, link)

      const result = applyStepEvent(link, startOfS1)

      expect(result).toEqual({ accepted: true })
      expect(stepsOnDisk()).toEqual([stepOf('s1', { status: 'in_progress', startedAt })])
    })

    it('refuses a symlinked .agent-flow whatever it points to, and writes nothing', () => {
      givenOutsidePlan()
      symlinkSync(outside(), agentFlow)

      const result = applyStepEvent(worktree, startOfS1)

      expect(result).toEqual(missing('.agent-flow must be a real directory'))
      expectOutsideUntouched()
    })

    it('refuses a .agent-flow that is a plain file without replacing it', () => {
      writeFileSync(agentFlow, 'plain')

      const result = applyStepEvent(worktree, startOfS1)

      expect(result).toEqual(missing('.agent-flow must be a real directory'))
      expect(readFileSync(agentFlow, 'utf8')).toBe('plain')
    })

    it('refuses a plan.json symlinked to an outside file and writes nothing', () => {
      const target = givenOutsidePlan()
      mkdirSync(agentFlow)
      symlinkSync(target, planPath)

      const result = applyStepEvent(worktree, startOfS1)

      expect(result).toEqual(missing('must be a regular file, not a link'))
      expectOutsideUntouched()
      expect(readdirSync(agentFlow)).toEqual(['plan.json'])
    })

    it('refuses a plan.json that is a directory', () => {
      mkdirSync(planPath, { recursive: true })

      const result = applyStepEvent(worktree, startOfS1)

      expect(result).toEqual(missing('must be a regular file, not a link'))
    })

    it('refuses a plan.json that is a named pipe instead of waiting on it', () => {
      mkdirSync(agentFlow)
      execFileSync('mkfifo', [planPath])

      const result = applyStepEvent(worktree, startOfS1)

      expect(result).toEqual(missing('must be a regular file, not a link'))
    })

    it('reports an unreadable plan.json without leaking the host error', () => {
      givenPlan(planWith([stepOf('s1')]))
      const denied = ((...args: Parameters<typeof openSync>) => {
        if (!String(args[0]).endsWith('plan.json')) return openSync(...args)
        throw Object.assign(new Error(`EACCES: permission denied, open '${String(args[0])}'`), {
          code: 'EACCES',
        })
      }) as typeof openSync

      const result = writerWith({ openSync: denied })(worktree, startOfS1)

      expect(result).toEqual(missing('cannot be read'))
    })

    it('reports a plan.json that opens but cannot be read as cannot be read', () => {
      givenPlan(planWith([stepOf('s1')]))
      const closedAfterOpen = ((...args: Parameters<typeof openSync>) => {
        const fd = openSync(...args)
        if (String(args[0]).endsWith('plan.json')) closeSync(fd)
        return fd
      }) as typeof openSync

      const result = writerWith({ openSync: closedAfterOpen })(worktree, startOfS1)

      expect(result).toEqual(missing('cannot be read'))
    })

    it('refuses to write through a temporary name planted as a symlink to an outside file', () => {
      const target = givenOutsidePlan()
      givenPlan(planWith([stepOf('s1')]))
      const planted = join(agentFlow, '.plan.json.fixed.tmp')
      symlinkSync(target, planted)

      const result = writerWith({})(worktree, startOfS1)

      expect(result).toEqual(missing('cannot be written'))
      expectOutsideUntouched()
      expect(readlinkSync(planted)).toBe(target)
    })

    it('refuses to rename when .agent-flow became a symlink to an outside folder mid-write', () => {
      givenOutsidePlan()
      const plan = planWith([stepOf('s1')])
      givenPlan(plan)
      const moved = join(root, 'moved')
      const swapDirectory = ((...args: Parameters<typeof writeSync>) => {
        renameSync(agentFlow, moved)
        symlinkSync(outside(), agentFlow)
        return writeSync(...args)
      }) as typeof writeSync

      const result = writerWith({ writeSync: swapDirectory })(worktree, startOfS1)

      expect(result).toEqual(missing('cannot be written'))
      expectOutsideUntouched()
      expect(readFileSync(join(moved, 'plan.json'), 'utf8')).toBe(plan)
    })

    it('refuses to rename when an ancestor of .agent-flow was swapped for a link mid-write', () => {
      const plan = planWith([stepOf('s1')])
      givenPlan(plan)
      const moved = join(root, 'moved')
      const swapAncestor = ((...args: Parameters<typeof writeSync>) => {
        renameSync(worktree, moved)
        symlinkSync(moved, worktree)
        return writeSync(...args)
      }) as typeof writeSync

      const result = writerWith({ writeSync: swapAncestor })(worktree, startOfS1)

      expect(result).toEqual(missing('cannot be written'))
      expect(readdirSync(join(moved, '.agent-flow'))).toEqual(['plan.json'])
      expect(readFileSync(join(moved, '.agent-flow', 'plan.json'), 'utf8')).toBe(plan)
    })

    it('answers cannot be written when .agent-flow disappears mid-write', () => {
      givenPlan(planWith([stepOf('s1')]))
      const removeDirectory = ((...args: Parameters<typeof writeSync>) => {
        rmSync(agentFlow, { recursive: true })
        return writeSync(...args)
      }) as typeof writeSync

      const result = writerWith({ writeSync: removeDirectory })(worktree, startOfS1)

      expect(result).toEqual(missing('cannot be written'))
    })

    it('replaces a plan.json swapped for a symlink after the read instead of following it', () => {
      const target = givenOutsidePlan()
      givenPlan(planWith([stepOf('s1')]))
      const swapPlan = ((...args: Parameters<typeof writeSync>) => {
        rmSync(planPath)
        symlinkSync(target, planPath)
        return writeSync(...args)
      }) as typeof writeSync

      const result = writerWith({ writeSync: swapPlan })(worktree, startOfS1)

      expect(result).toEqual({ accepted: true })
      expectOutsideUntouched()
      expect(lstatSync(planPath).isFile()).toBe(true)
      expect(stepsOnDisk()).toEqual([stepOf('s1', { status: 'in_progress', startedAt })])
    })
  })

  describe('bounded read', () => {
    const limit = 4 * 1_048_576

    it('hands a plan of exactly four times the text limit to the contract, which refuses it', () => {
      givenPlan('a'.repeat(limit))

      const result = applyStepEvent(worktree, { kind: 'start', stepId: 's1', at: startedAt })

      expect(result).toEqual(missing('exceeds 1048576 characters'))
    })

    it('refuses a plan one byte over four times the text limit as too large', () => {
      givenPlan('a'.repeat(limit + 1))

      const result = applyStepEvent(worktree, { kind: 'start', stepId: 's1', at: startedAt })

      expect(result).toEqual(missing('is too large'))
    })

    const countingReads = (counter: { total: number }, afterRead?: () => void): typeof readSync =>
      ((...args: Parameters<typeof readSync>) => {
        const count = readSync(...args)
        counter.total += count
        afterRead?.()
        return count
      }) as typeof readSync

    it('never reads more than one byte past the limit from an oversized plan', () => {
      givenPlan('a'.repeat(limit + 1000))
      const counter = { total: 0 }

      const result = writerWith({ readSync: countingReads(counter) })(worktree, startOfS1)

      expect(result).toEqual(missing('is too large'))
      expect(counter.total).toBe(limit + 1)
    })

    it('stays within the limit when the plan grows after it was opened', () => {
      givenPlan(planWith([stepOf('s1')]))
      const counter = { total: 0 }
      let grown = false
      const grow = (): void => {
        if (grown) return
        grown = true
        appendFileSync(planPath, 'a'.repeat(limit))
      }

      const result = writerWith({ readSync: countingReads(counter, grow) })(worktree, startOfS1)

      expect(result).toEqual(missing('is too large'))
      expect(counter.total).toBe(limit + 1)
    })

    it('assembles a plan delivered in short reads', () => {
      givenPlan(planWith([stepOf('s1')]))
      const sevenBytes = ((fd: number, buffer: Uint8Array, offset: number, length: number) =>
        readSync(fd, buffer, offset, Math.min(7, length), null)) as typeof readSync

      const result = writerWith({ readSync: sevenBytes })(worktree, startOfS1)

      expect(result).toEqual({ accepted: true })
      expect(stepsOnDisk()).toEqual([stepOf('s1', { status: 'in_progress', startedAt })])
    })
  })

  describe('plan and directory presence', () => {
    it('creates a missing .agent-flow directory, refuses the event and writes no plan', () => {
      const result = applyStepEvent(worktree, { kind: 'start', stepId: 's1', at: startedAt })

      expect(result).toEqual(missing('is missing'))
      expect(readdirSync(agentFlow)).toEqual([])
    })

    it('refuses a missing plan.json inside an existing .agent-flow and creates nothing', () => {
      mkdirSync(agentFlow)

      const result = applyStepEvent(worktree, { kind: 'finish', stepId: 's1', at: startedAt })

      expect(result).toEqual(missing('is missing'))
      expect(readdirSync(agentFlow)).toEqual([])
    })
  })
})
