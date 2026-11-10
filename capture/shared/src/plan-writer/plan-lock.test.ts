import { spawn } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validatePlan } from '@agent-flow/core/contracts'
import { refusalFor } from '../shared/confinement'
import { withLock } from '../shared/plan-lock'
import { addPlanStep } from './index'
import { createPlanBatchWriter, createPlanStepAdder, createPlanWriter } from './plan-writer'
import type { PlanOperation, PlanWriterIo } from './plan-writer'

const { lockOpens } = vi.hoisted(() => ({ lockOpens: { count: 0 } }))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const countedOpenSync: typeof actual.openSync = ((...args: Parameters<typeof actual.openSync>) => {
    if (String(args[0]).endsWith('.plan.lock')) lockOpens.count += 1
    return actual.openSync(...args)
  }) as typeof actual.openSync
  return { ...actual, openSync: countedOpenSync }
})

const repo = fileURLToPath(new URL('../../../../', import.meta.url))

const io: PlanWriterIo = {
  openSync,
  readSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
  temporaryName: () => 'fixed',
}

const startedAt = '2026-01-01T10:00:00.000Z'
const hourAgo = (): number => Date.now() / 1000 - 3600

const planWith = (steps: readonly unknown[]): string =>
  JSON.stringify({ issue: '#78', title: 'Plan seeding', steps })

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

const busyMessage = 'is busy; remove .agent-flow/.plan.lock only if no write is running'
const staleMessage = 'is locked by a stale lock file; remove .agent-flow/.plan.lock'

const quietestPollMs = 1
const staleWaitOutGuardMs = 10_000

const refusal = (message: string) => ({
  accepted: false,
  errors: [{ file: 'plan.json', location: null, field: null, message }],
})

let root: string
let worktree: string
let agentFlow: string
let planPath: string
let lockPath: string

beforeEach(() => {
  lockOpens.count = 0
  root = realpathSync(mkdtempSync(join(tmpdir(), 'plan-lock-')))
  worktree = join(root, 'worktree')
  agentFlow = join(worktree, '.agent-flow')
  planPath = join(agentFlow, 'plan.json')
  lockPath = join(agentFlow, '.plan.lock')
  mkdirSync(agentFlow, { recursive: true })
})

afterEach(() => {
  vi.useRealTimers()
  rmSync(root, { recursive: true, force: true })
})

const givenPlan = (plan: string): void => writeFileSync(planPath, plan)

const stepsOnDisk = (): { id: string }[] => JSON.parse(readFileSync(planPath, 'utf8')).steps

const workerSource = `
import { existsSync } from 'node:fs'
import { register } from 'tsx/esm/api'
const [tsconfig, moduleUrl, worktree, stepId, goFile] = process.argv.slice(1)
register({ tsconfig })
const { addPlanStep } = await import(moduleUrl)
process.stdout.write('ready\\n')
const pause = new Int32Array(new SharedArrayBuffer(4))
while (!existsSync(goFile)) Atomics.wait(pause, 0, 0, 1)
const result = addPlanStep(worktree, { stepId, title: 'dev-a: ' + stepId })
process.stdout.write(JSON.stringify(result) + '\\n')
process.exitCode = result.accepted ? 0 : 1
`

type Finished = { readonly code: number | null; readonly output: string; readonly errors: string }

const runWorker = (stepId: string, goFile: string, onReady: () => void): Promise<Finished> =>
  new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        workerSource,
        join(repo, 'tsconfig.json'),
        pathToFileURL(join(repo, 'capture/shared/src/plan-writer/index.ts')).href,
        worktree,
        stepId,
        goFile,
      ],
      { cwd: repo },
    )
    let output = ''
    let errors = ''
    child.stdout.on('data', (chunk) => {
      if (output === '') onReady()
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      errors += chunk
    })
    child.on('close', (code) => resolve({ code, output, errors }))
  })

const addConcurrently = (stepIds: readonly string[]): Promise<Finished[]> => {
  const goFile = join(root, 'go')
  let ready = 0
  return Promise.all(
    stepIds.map((stepId) =>
      runWorker(stepId, goFile, () => {
        ready += 1
        if (ready === stepIds.length) writeFileSync(goFile, '')
      }),
    ),
  )
}

describe('plan.json read-modify-write lock', () => {
  it(
    'keeps every step when separate processes (O_CREAT|O_EXCL claim, identity-checked unlink) add different steps at the same moment',
    { timeout: 60_000 },
    async () => {
      givenPlan(planWith([]))
      const stepIds = Array.from({ length: 12 }, (_, index) => `s${index}`)

      const finished = await addConcurrently(stepIds)

      expect(finished.map((run) => `${run.code} ${run.errors}`)).toEqual(stepIds.map(() => '0 '))
      expect(stepsOnDisk().map((step) => step.id).sort()).toEqual([...stepIds].sort())
      expect(validatePlan(readFileSync(planPath, 'utf8'))).toEqual({ accepted: true })
      expect(readdirSync(agentFlow)).toEqual(['plan.json'])
    },
  )

  it('waits for a lock another process releases with unlink(2) through rm and then applies its step', () => {
    givenPlan(planWith([]))
    writeFileSync(lockPath, '')
    spawn('sh', ['-c', 'sleep 0.3 && rm -- "$0"', lockPath], { stdio: 'ignore' })
    const adder = createPlanStepAdder(io, { waitMs: 10_000, staleAfterMs: 60_000 })

    const result = adder(worktree, { stepId: 's1', title: 'dev-a: Implementation' })

    expect(result).toEqual({ accepted: true })
    expect(stepsOnDisk()).toEqual([stepOf('s1')])
    expect(readdirSync(agentFlow)).toEqual(['plan.json'])
  })

  describe.each([
    [
      'addPlanStep',
      () =>
        createPlanStepAdder(io, { waitMs: 50, staleAfterMs: 60_000 })(worktree, {
          stepId: 's1',
          title: 'dev-a: Implementation',
        }),
    ],
    [
      'applyStepEvent',
      () =>
        createPlanWriter(io, { waitMs: 50, staleAfterMs: 60_000 })(worktree, {
          kind: 'start',
          stepId: 's1',
          at: startedAt,
        }),
    ],
  ])('%s while another writer holds a fresh lock', (_name, apply) => {
    it('refuses as busy, leaves plan.json byte-identical and keeps the lock it did not create', () => {
      const plan = planWith([stepOf('s1')])
      givenPlan(plan)
      writeFileSync(lockPath, '')

      const result = apply()

      expect(result).toEqual(refusal(busyMessage))
      expect(readFileSync(planPath, 'utf8')).toBe(plan)
      expect(existsSync(lockPath)).toBe(true)
    })
  })

  it(
    'refuses without waiting out the timeout when the lock is older than the stale age, and does not steal it',
    { timeout: staleWaitOutGuardMs },
    () => {
      const plan = planWith([])
      givenPlan(plan)
      writeFileSync(lockPath, '')
      utimesSync(lockPath, hourAgo(), hourAgo())

      const result = addPlanStep(worktree, { stepId: 's1', title: 'dev-a: Implementation' })

      expect(result).toEqual(refusal(staleMessage))
      expect(lockOpens.count).toBeGreaterThanOrEqual(1)
      expect(lockOpens.count).toBeLessThan(10)
      expect(readFileSync(planPath, 'utf8')).toBe(plan)
      expect(existsSync(lockPath)).toBe(true)
    },
  )

  it.each([
    ['a symlink to an outside file', (outside: string) => symlinkSync(outside, lockPath)],
    ['a dangling symlink', () => symlinkSync(join(root, 'nowhere'), lockPath)],
    ['a directory', () => mkdirSync(lockPath)],
  ])('refuses a lock path that is %s and writes nothing through it', (_name, plant) => {
    const plan = planWith([])
    givenPlan(plan)
    const outside = join(root, 'outside')
    writeFileSync(outside, 'untouched')
    plant(outside)

    const result = addPlanStep(worktree, { stepId: 's1', title: 'dev-a: Implementation' })

    expect(result).toEqual(refusal('lock must be a regular file, not a link'))
    expect(readFileSync(planPath, 'utf8')).toBe(plan)
    expect(readFileSync(outside, 'utf8')).toBe('untouched')
    expect(readdirSync(agentFlow).sort()).toEqual(['.plan.lock', 'plan.json'])
  })

  it.skipIf(process.getuid?.() === 0)('refuses when the lock cannot be created and writes nothing', () => {
    const plan = planWith([])
    givenPlan(plan)
    chmodSync(agentFlow, 0o500)

    const result = addPlanStep(worktree, { stepId: 's1', title: 'dev-a: Implementation' })
    chmodSync(agentFlow, 0o700)

    expect(result).toEqual(refusal('cannot be locked'))
    expect(readFileSync(planPath, 'utf8')).toBe(plan)
    expect(readdirSync(agentFlow)).toEqual(['plan.json'])
  })

  it('sleeps between attempts instead of spinning while it waits for a held lock', () => {
    writeFileSync(lockPath, '')
    const waitMs = 300
    const refuseLock = refusalFor('plan.json')

    const result = withLock(lockPath, { waitMs, staleAfterMs: 60_000 }, refuseLock, () => ({ accepted: true }))

    expect(result).toEqual(refusal(busyMessage))
    expect(lockOpens.count).toBeGreaterThan(1)
    expect(lockOpens.count).toBeLessThanOrEqual(waitMs / quietestPollMs + 1)
  })

  it('keeps retrying while another process claims the lock with an O_TRUNC write and releases it with unlink(2)', async () => {
    givenPlan(planWith([]))
    const churn = `
      const { writeFileSync, unlinkSync } = require('node:fs')
      process.stdout.write('churning\\n')
      const end = Date.now() + 5000
      while (Date.now() < end) {
        try { writeFileSync(process.argv[1], ''); unlinkSync(process.argv[1]) } catch {}
      }
    `
    const churner = spawn(process.execPath, ['-e', churn, lockPath])
    await new Promise((churning) => churner.stdout.once('data', churning))
    const adder = createPlanStepAdder(io, { waitMs: 10_000, staleAfterMs: 60_000 })
    const stepIds = Array.from({ length: 60 }, (_, index) => `s${index}`)

    const results = stepIds.map((stepId) => adder(worktree, { stepId, title: 'dev-a: Implementation' }))
    churner.kill()

    expect(results.map((result) => result.accepted)).toEqual(stepIds.map(() => true))
    expect(stepsOnDisk().map((step) => step.id)).toEqual(stepIds)
  })

  it.skipIf(!existsSync('/proc/self/fd'))('closes the descriptor it opens for the lock', () => {
    givenPlan(planWith([]))
    const openDescriptors = (): number => readdirSync('/proc/self/fd').length
    const before = openDescriptors()

    for (let index = 0; index < 20; index += 1) {
      addPlanStep(worktree, { stepId: `s${index}`, title: 'dev-a: Implementation' })
    }

    expect(openDescriptors()).toBe(before)
  })

  it('releases the lock after a lifecycle refusal', () => {
    givenPlan(planWith([]))

    const result = addPlanStep(worktree, { stepId: '', title: 'dev-a: Implementation' })

    expect(result.accepted).toBe(false)
    expect(readdirSync(agentFlow)).toEqual(['plan.json'])
  })
})

describe('lock clock boundaries', () => {
  const frozenAt = new Date('2026-01-01T10:00:00.000Z')
  const refuseLock = refusalFor('plan.json')
  const completed = () => ({ accepted: true as const })

  const freezeClocks = (): void => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'] })
    vi.setSystemTime(frozenAt)
  }

  const lockAgedBy = (milliseconds: number): void => {
    writeFileSync(lockPath, '')
    const seconds = (frozenAt.getTime() - milliseconds) / 1000
    utimesSync(lockPath, seconds, seconds)
  }

  it('treats a lock exactly as old as the stale age as busy, not stale', () => {
    freezeClocks()
    lockAgedBy(60_000)

    const result = withLock(lockPath, { waitMs: 0, staleAfterMs: 60_000 }, refuseLock, completed)

    expect(result).toEqual(refusal(busyMessage))
    expect(existsSync(lockPath)).toBe(true)
  })

  it('tries a held fresh lock once and refuses as busy when the wait is zero, leaving the lock', () => {
    freezeClocks()
    lockAgedBy(0)
    spawn('sh', ['-c', 'sleep 0.3 && rm -f -- "$0"', lockPath], { stdio: 'ignore' })
    let worked = false

    const result = withLock(lockPath, { waitMs: 0, staleAfterMs: 60_000 }, refuseLock, () => {
      worked = true
      return completed()
    })

    expect(result).toEqual(refusal(busyMessage))
    expect(worked).toBe(false)
    expect(existsSync(lockPath)).toBe(true)
  })

  it('treats a lock dated further in the future than the stale age as stale', () => {
    freezeClocks()
    lockAgedBy(-3_600_000)

    const result = withLock(lockPath, { waitMs: 0, staleAfterMs: 60_000 }, refuseLock, completed)

    expect(result).toEqual(refusal(staleMessage))
    expect(existsSync(lockPath)).toBe(true)
  })

  it('treats a lock dated exactly the stale age in the future as busy, not stale', () => {
    freezeClocks()
    lockAgedBy(-60_000)

    const result = withLock(lockPath, { waitMs: 0, staleAfterMs: 60_000 }, refuseLock, completed)

    expect(result).toEqual(refusal(busyMessage))
  })

  it('ends the wait on the monotonic clock even when the wall clock stands still', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(frozenAt)
    lockAgedBy(0)
    spawn('sh', ['-c', 'sleep 1 && rm -f -- "$0"', lockPath], { stdio: 'ignore' })
    let worked = false

    const result = withLock(lockPath, { waitMs: 100, staleAfterMs: 60_000 }, refuseLock, () => {
      worked = true
      return completed()
    })

    expect(result).toEqual(refusal(busyMessage))
    expect(worked).toBe(false)
  })
})

describe('a batch of plan operations under one lock', () => {
  const additions = Array.from({ length: 30 }, (_unused, index) => ({
    kind: 'add' as const,
    stepId: `s${index}`,
    title: `s${index}`,
  }))

  it('waits once for a held lock and refuses every operation, leaving plan.json and the lock', () => {
    const plan = planWith([])
    givenPlan(plan)
    writeFileSync(lockPath, '')
    const waitMs = 100
    const batch = createPlanBatchWriter(io, { waitMs, staleAfterMs: 60_000 })

    const results = batch(worktree, additions)

    expect(lockOpens.count).toBeGreaterThan(1)
    expect(lockOpens.count).toBeLessThanOrEqual(waitMs / quietestPollMs + 1)
    expect(results).toEqual(additions.map(() => refusal(busyMessage)))
    expect(readFileSync(planPath, 'utf8')).toBe(plan)
    expect(existsSync(lockPath)).toBe(true)
  })

  it('applies every operation in order under one lock and releases it', () => {
    givenPlan(planWith([]))
    const batch = createPlanBatchWriter(io, { waitMs: 200, staleAfterMs: 60_000 })

    const results = batch(worktree, [
      { kind: 'add', stepId: 's1', title: 'dev-a: One' },
      { kind: 'add', stepId: 's2', title: 'dev-a: Two' },
      { kind: 'start', stepId: 's1', at: startedAt },
    ])

    expect(results).toEqual([{ accepted: true }, { accepted: true }, { accepted: true }])
    expect(stepsOnDisk().map((step) => step.id)).toEqual(['s1', 's2'])
    expect(readdirSync(agentFlow)).toEqual(['plan.json'])
  })

  it('goes on after an operation the lifecycle refuses', () => {
    givenPlan(planWith([]))
    const batch = createPlanBatchWriter(io, { waitMs: 200, staleAfterMs: 60_000 })

    const results = batch(worktree, [
      { kind: 'add', stepId: 's1', title: 'dev-a: One' },
      { kind: 'finish', stepId: 'ghost', at: startedAt },
      { kind: 'add', stepId: 's2', title: 'dev-a: Two' },
    ])

    expect(results.map((result) => result.accepted)).toEqual([true, false, true])
    expect(stepsOnDisk().map((step) => step.id)).toEqual(['s1', 's2'])
  })

  it('answers an empty batch with nothing and a malformed operation with its own refusal, without taking the lock', () => {
    givenPlan(planWith([]))
    writeFileSync(lockPath, '')
    const batch = createPlanBatchWriter(io, { waitMs: 0, staleAfterMs: 60_000 })

    expect(batch(worktree, [])).toEqual([])
    const malformed = { kind: 'bogus', stepId: 's1', at: startedAt } as unknown as PlanOperation
    expect(batch(worktree, [malformed])).toEqual([
      {
        accepted: false,
        errors: [{ file: 'plan.json', location: null, field: 'kind', message: 'must be start or finish' }],
      },
    ])
  })

  it('applies the valid operations of a batch that also holds a malformed one', () => {
    givenPlan(planWith([]))
    const batch = createPlanBatchWriter(io)
    const malformed = { kind: 'bogus', stepId: 's1', at: startedAt } as unknown as PlanOperation

    const results = batch(worktree, [malformed, { kind: 'add', stepId: 's2', title: 'dev-a: Two' }])

    expect(results.map((result) => result.accepted)).toEqual([false, true])
    expect(stepsOnDisk().map((step) => step.id)).toEqual(['s2'])
  })

  it('refuses every operation when the worktree is not confinable', () => {
    const batch = createPlanBatchWriter(io)

    expect(batch('relative/path', additions.slice(0, 2)).map((result) => result.accepted)).toEqual([false, false])
  })
})

describe('lock ownership and descriptor faults', () => {
  const policy = { waitMs: 0, staleAfterMs: 60_000 }
  const refuseLock = refusalFor('plan.json')
  const completed = () => ({ accepted: true as const })
  const realIo = { openSync, closeSync, fstatSync, lstatSync, unlinkSync }

  it('leaves a lock another writer put in its place while it held the lock (rename over the lock path, unlink by identity)', () => {
    const other = `${lockPath}.other`

    const result = withLock(lockPath, policy, refuseLock, () => {
      writeFileSync(other, 'second writer')
      unlinkSync(lockPath)
      renameSync(other, lockPath)
      return completed()
    })

    expect(result).toEqual({ accepted: true })
    expect(readFileSync(lockPath, 'utf8')).toBe('second writer')
  })

  it('leaves a lock whose device differs from the one it created even when the inode matches', () => {
    const io = {
      ...realIo,
      lstatSync: ((path: string) => {
        const entry = lstatSync(path)
        return { ...entry, dev: entry.dev + 1 }
      }) as unknown as typeof lstatSync,
    }

    withLock(lockPath, policy, refuseLock, completed, io)

    expect(existsSync(lockPath)).toBe(true)
  })

  it('removes its own lock when the work finishes (unlink of the file it created)', () => {
    withLock(lockPath, policy, refuseLock, completed)

    expect(existsSync(lockPath)).toBe(false)
  })

  it('still runs and releases the lock when closing the descriptor fails after the lock was created', () => {
    const io = {
      ...realIo,
      closeSync: (descriptor: number) => {
        closeSync(descriptor)
        throw new Error('EIO')
      },
    }
    let worked = false

    const result = withLock(lockPath, policy, refuseLock, () => {
      worked = true
      return completed()
    }, io)

    expect(worked).toBe(true)
    expect(result).toEqual({ accepted: true })
    expect(existsSync(lockPath)).toBe(false)
  })

  it('refuses and removes the lock it just created when it cannot identify it', () => {
    const io = {
      ...realIo,
      fstatSync: (() => {
        throw new Error('EIO')
      }) as unknown as typeof fstatSync,
    }
    let worked = false

    const result = withLock(lockPath, policy, refuseLock, () => {
      worked = true
      return completed()
    }, io)

    expect(result).toEqual(refusal('cannot be locked'))
    expect(worked).toBe(false)
    expect(existsSync(lockPath)).toBe(false)
  })
})
