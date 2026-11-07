import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  linkSync,
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
  statSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import type { Stats } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import { appendDecision } from './index'
import { createDecisionAppender } from './decision-append'
import type { DecisionAppenderIo } from './decision-append'

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
  JSON.stringify({ issue: '#35', title: 'Decisions appender', steps })

const inProgress = (id: string) =>
  stepOf(id, { status: 'in_progress', startedAt: '2026-01-01T10:00:00.000Z' })

const decisionOf = (overlays: Record<string, unknown> = {}) => ({
  at: '2026-01-01T10:05:00.000Z',
  step: 's1',
  role: 'dev-a',
  kind: 'decision',
  title: 'Use a factory',
  why: 'It keeps the seam narrow',
  confidence: 'high',
  ...overlays,
})

const withoutStep = (): Record<string, unknown> => {
  const { step: _step, ...rest } = decisionOf()
  return rest
}

const refused = (message: string, field: string | null = null, file = 'decisions.jsonl') => ({
  accepted: false,
  errors: [{ file, location: null, field, message }],
})

const notRegular = 'must be a regular file, not a link'

let root: string
let worktree: string
let agentFlow: string
let decisionsPath: string
let planPath: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'decision-append-')))
  worktree = join(root, 'worktree')
  agentFlow = join(worktree, '.agent-flow')
  decisionsPath = join(agentFlow, 'decisions.jsonl')
  planPath = join(agentFlow, 'plan.json')
  mkdirSync(agentFlow, { recursive: true })
  writeFileSync(planPath, planWith([inProgress('s1')]))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const givenPlan = (plan: string): void => writeFileSync(planPath, plan)
const givenDecisions = (text: string): void => writeFileSync(decisionsPath, text)
const decisionsOnDisk = (): string => readFileSync(decisionsPath, 'utf8')
const lineOf = (value: unknown): string => `${JSON.stringify(value)}\n`

const realIo: DecisionAppenderIo = {
  openSync,
  readSync,
  writeSync,
  closeSync,
  fstatSync,
  lstatSync,
}

const appenderWith = (overrides: Partial<DecisionAppenderIo>) =>
  createDecisionAppender({ ...realIo, ...overrides })

const failure = (): never => {
  throw new Error('injected fault')
}

const sevenBytesAtATime = ((fd: number, buffer: Uint8Array, offset: number) =>
  writeSync(fd, buffer, offset, Math.min(7, buffer.length - offset))) as typeof writeSync

const descriptorEvents = () => {
  const events: string[] = []
  const overrides: Partial<DecisionAppenderIo> = {
    openSync: ((...args: Parameters<typeof openSync>) => {
      events.push(String(args[0]).endsWith('plan.json') ? 'open plan' : 'open decisions')
      return openSync(...args)
    }) as typeof openSync,
    closeSync: (fd) => {
      events.push('close')
      closeSync(fd)
    },
  }
  return { overrides, events }
}

const failingDecisionsOpen = ((...args: Parameters<typeof openSync>) =>
  String(args[0]).endsWith('decisions.jsonl') ? failure() : openSync(...args)) as typeof openSync

const failingLastByteRead = ((
  fd: number,
  buffer: Uint8Array,
  offset: number,
  length: number,
  position: number | null,
) => (position === null ? readSync(fd, buffer, offset, length, position) : failure())) as typeof readSync

const afterOpening =
  (action: () => void): typeof openSync =>
  ((...args: Parameters<typeof openSync>) => {
    const fd = openSync(...args)
    if (String(args[0]).endsWith('decisions.jsonl')) action()
    return fd
  }) as typeof openSync

describe('appendDecision', () => {
  describe('appending', () => {
    it('adds one line and keeps the existing lines byte for byte', () => {
      const existing = `${lineOf(decisionOf({ title: 'a' }))}${lineOf(decisionOf({ title: 'b' }))}`
      givenDecisions(existing)

      const result = appendDecision(worktree, decisionOf())

      expect(result).toEqual({ accepted: true })
      expect(decisionsOnDisk()).toBe(`${existing}${lineOf(decisionOf())}`)
    })

    it('creates decisions.jsonl when .agent-flow has none', () => {
      const result = appendDecision(worktree, decisionOf())

      expect(result).toEqual({ accepted: true })
      expect(decisionsOnDisk()).toBe(lineOf(decisionOf()))
    })

    it('creates the file readable by others, as the umask allows', () => {
      appendDecision(worktree, decisionOf())

      expect(statSync(decisionsPath).mode & 0o777).toBe(0o666 & ~process.umask())
    })

    it('starts a new line when the file does not end with a newline', () => {
      givenDecisions('{"partial":')

      const result = appendDecision(worktree, decisionOf())

      expect(result).toEqual({ accepted: true })
      expect(decisionsOnDisk()).toBe(`{"partial":\n${lineOf(decisionOf())}`)
    })

    it('adds no blank line when the file already ends with a newline', () => {
      givenDecisions('x\n')

      appendDecision(worktree, decisionOf())

      expect(decisionsOnDisk()).toBe(`x\n${lineOf(decisionOf())}`)
    })

    it('escapes the line separators the contract serialises away', () => {
      appendDecision(worktree, decisionOf({ title: 'a\u2028b' }))

      expect(decisionsOnDisk()).toBe(`${JSON.stringify(decisionOf({ title: 'a\u2028b' })).replaceAll('\u2028', '\\u2028')}\n`)
    })
  })

  describe('refusing an invalid decision', () => {
    it('returns the contract error and writes nothing', () => {
      const existing = lineOf(decisionOf())
      givenDecisions(existing)

      const result = appendDecision(worktree, decisionOf({ confidence: 'certain' }))

      expect(result.accepted).toBe(false)
      expect(result).toMatchObject({ errors: [{ file: 'decisions.jsonl', field: 'confidence' }] })
      expect(decisionsOnDisk()).toBe(existing)
    })

    it('does not even create decisions.jsonl', () => {
      appendDecision(worktree, decisionOf({ title: '' }))

      expect(readdirSync(agentFlow)).toEqual(['plan.json'])
    })

    it('opens only the plan for an invalid decision', () => {
      const opened: string[] = []
      const spy = ((...args: Parameters<typeof openSync>) => {
        opened.push(String(args[0]))
        return openSync(...args)
      }) as typeof openSync

      appenderWith({ openSync: spy })(worktree, decisionOf({ title: '' }))

      expect(opened).toEqual([planPath])
    })

    it.each<[string, unknown]>([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'decision'],
      ['an array', [decisionOf()]],
    ])('refuses a decision that is %s', (_name, decision) => {
      givenPlan(planWith([inProgress('s1')]))

      const result = appendDecision(worktree, decision)

      expect(result.accepted).toBe(false)
      expect(readdirSync(agentFlow)).toEqual(['plan.json'])
    })
  })

  describe('binding the decision to the step in progress', () => {
    it('uses the step in progress in plan.json', () => {
      givenPlan(planWith([stepOf('s0', { status: 'done' }), inProgress('s2'), stepOf('s3')]))

      const result = appendDecision(worktree, withoutStep())

      expect(result).toEqual({ accepted: true })
      expect(decisionsOnDisk()).toBe(lineOf({ ...withoutStep(), step: 's2' }))
    })

    it('appends a decision naming the step in progress unchanged', () => {
      givenPlan(planWith([stepOf('s1', { status: 'done' }), inProgress('s2')]))

      const result = appendDecision(worktree, decisionOf({ step: 's2' }))

      expect(result).toEqual({ accepted: true })
      expect(decisionsOnDisk()).toBe(lineOf(decisionOf({ step: 's2' })))
    })

    it('refuses a step other than the one in progress and writes nothing', () => {
      givenPlan(planWith([inProgress('s2'), stepOf('s1', { status: 'done' })]))
      givenDecisions('x\n')

      const result = appendDecision(worktree, decisionOf({ step: 's1' }))

      expect(result).toEqual(refused('is not the step in progress', 'step'))
      expect(decisionsOnDisk()).toBe('x\n')
    })

    it('refuses a step when none is in progress and writes nothing', () => {
      givenPlan(planWith([stepOf('s1')]))
      givenDecisions('x\n')

      const result = appendDecision(worktree, decisionOf({ step: 's1' }))

      expect(result).toEqual(refused('no step is in progress', 'step'))
      expect(decisionsOnDisk()).toBe('x\n')
    })

    it('does not default an explicitly invalid step', () => {
      givenPlan(planWith([inProgress('s2')]))

      const result = appendDecision(worktree, decisionOf({ step: '' }))

      expect(result.accepted).toBe(false)
      expect(readdirSync(agentFlow)).toEqual(['plan.json'])
    })

    it('refuses with a message when no step is in progress', () => {
      const plan = planWith([stepOf('s1'), stepOf('s2', { status: 'done' })])
      givenPlan(plan)
      givenDecisions('x\n')

      const result = appendDecision(worktree, withoutStep())

      expect(result).toEqual(refused('no step is in progress', 'step'))
      expect(decisionsOnDisk()).toBe('x\n')
      expect(readFileSync(planPath, 'utf8')).toBe(plan)
    })

    it('answers with the plan errors when plan.json breaks the contract', () => {
      givenPlan('{"issue":')

      const result = appendDecision(worktree, withoutStep())

      expect(result.accepted).toBe(false)
      expect(result).toMatchObject({ errors: [{ file: 'plan.json' }] })
      expect(readdirSync(agentFlow)).toEqual(['plan.json'])
    })

    it('refuses with a plan.json label when plan.json is missing', () => {
      rmSync(planPath)

      expect(appendDecision(worktree, withoutStep())).toEqual(refused('is missing', null, 'plan.json'))
    })

    it('refuses a symlinked plan.json', () => {
      const outside = join(root, 'plan.json')
      writeFileSync(outside, planWith([inProgress('s1')]))
      rmSync(planPath)
      symlinkSync(outside, planPath)

      expect(appendDecision(worktree, withoutStep())).toEqual(refused(notRegular, null, 'plan.json'))
      expect(readdirSync(agentFlow)).toEqual(['plan.json'])
    })

    it.each<[string, () => void]>([
      ['missing', () => rmSync(planPath)],
      ['malformed', () => givenPlan('{"issue":')],
    ])('refuses a decision naming a step when plan.json is %s and writes nothing', (_name, breakPlan) => {
      breakPlan()
      givenDecisions('x\n')

      const result = appendDecision(worktree, decisionOf({ step: 's1' }))

      expect(result.accepted).toBe(false)
      expect(result).toMatchObject({ errors: [{ file: 'plan.json' }] })
      expect(decisionsOnDisk()).toBe('x\n')
    })

    it('treats an own undefined step as given, not as absent', () => {
      givenPlan(planWith([inProgress('s1')]))

      const result = appendDecision(worktree, { ...withoutStep(), step: undefined })

      expect(result.accepted).toBe(false)
      expect(readdirSync(agentFlow)).toEqual(['plan.json'])
    })
  })

  describe('confinement', () => {
    it.each<[string, string]>([
      ['a relative path', 'worktree'],
      ['a path with a .. segment', '/x/../y'],
      ['a path with a . segment', '/x/./y'],
      ['an empty string', ''],
    ])('refuses %s before touching the disk', (_name, path) => {
      expect(appendDecision(path, decisionOf())).toEqual(
        refused('worktree must be an absolute path without . or .. segments'),
      )
      expect(readdirSync(agentFlow)).toEqual(['plan.json'])
    })

    it('refuses a worktree that is not a string', () => {
      expect(appendDecision(42 as never, decisionOf())).toEqual(
        refused('worktree must be an absolute path without . or .. segments'),
      )
    })

    it('refuses a worktree that does not exist', () => {
      expect(appendDecision(join(root, 'nowhere'), decisionOf())).toEqual(
        refused('worktree cannot be resolved'),
      )
    })

    it('refuses a worktree going through ..', () => {
      const outside = join(root, 'outside')
      mkdirSync(join(outside, '.agent-flow'), { recursive: true })

      const result = appendDecision(`${worktree}/../outside`, decisionOf())

      expect(result.accepted).toBe(false)
      expect(readdirSync(join(outside, '.agent-flow'))).toEqual([])
    })

    it('refuses a symlinked .agent-flow and writes nothing outside', () => {
      const moved = join(root, 'outside')
      renameSync(agentFlow, moved)
      symlinkSync(moved, agentFlow)

      const result = appendDecision(worktree, decisionOf())

      expect(result).toEqual(refused('.agent-flow must be a real directory'))
      expect(readdirSync(moved)).toEqual(['plan.json'])
    })

    it('refuses a missing .agent-flow and does not create it', () => {
      rmSync(agentFlow, { recursive: true })

      expect(appendDecision(worktree, decisionOf())).toEqual(refused('.agent-flow is missing'))
      expect(readdirSync(worktree)).toEqual([])
    })

    it('refuses an .agent-flow that is a file', () => {
      rmSync(agentFlow, { recursive: true })
      writeFileSync(agentFlow, '')

      expect(appendDecision(worktree, decisionOf())).toEqual(
        refused('.agent-flow must be a real directory'),
      )
    })

    it.skipIf(process.getuid?.() === 0)('refuses an .agent-flow whose status cannot be read', () => {
      chmodSync(worktree, 0o000)

      try {
        expect(appendDecision(worktree, decisionOf())).toEqual(refused('.agent-flow cannot be read'))
      } finally {
        chmodSync(worktree, 0o755)
      }
    })

    it('refuses a symlinked decisions.jsonl and leaves the target untouched', () => {
      const outside = join(root, 'outside.jsonl')
      writeFileSync(outside, 'secret\n')
      symlinkSync(outside, decisionsPath)

      const result = appendDecision(worktree, decisionOf())

      expect(result).toEqual(refused(notRegular))
      expect(readFileSync(outside, 'utf8')).toBe('secret\n')
    })

    it('refuses a decisions.jsonl that is a directory', () => {
      mkdirSync(decisionsPath)

      const result = appendDecision(worktree, decisionOf())

      expect(result).toEqual(refused('cannot be written'))
    })

    it('refuses a decisions.jsonl that is a FIFO without blocking', () => {
      execFileSync('mkfifo', [decisionsPath])

      const result = appendDecision(worktree, decisionOf())

      expect(result).toEqual(refused(notRegular))
    })

    it('refuses when .agent-flow is swapped for a link after the file is opened', () => {
      const moved = join(root, 'moved')
      const swap = afterOpening(() => {
        renameSync(agentFlow, moved)
        symlinkSync(moved, agentFlow)
      })

      const result = appenderWith({ openSync: swap })(worktree, decisionOf())

      expect(result).toEqual(refused('.agent-flow must be a real directory'))
      expect(readFileSync(join(moved, 'decisions.jsonl'), 'utf8')).toBe('')
    })

    it('refuses when decisions.jsonl is replaced after it was opened', () => {
      givenDecisions('old\n')
      const swap = afterOpening(() => {
        renameSync(decisionsPath, join(root, 'old.jsonl'))
        writeFileSync(decisionsPath, 'new\n')
      })

      const result = appenderWith({ openSync: swap })(worktree, decisionOf())

      expect(result).toEqual(refused(notRegular))
      expect(readFileSync(join(root, 'old.jsonl'), 'utf8')).toBe('old\n')
      expect(decisionsOnDisk()).toBe('new\n')
    })
  })

  describe('identity of the opened file', () => {
    it('refuses a decisions.jsonl hard linked to a file outside .agent-flow', () => {
      const outside = join(root, 'outside.jsonl')
      writeFileSync(outside, 'secret\n')
      linkSync(outside, decisionsPath)

      const result = appendDecision(worktree, decisionOf())

      expect(result).toEqual(refused(notRegular))
      expect(readFileSync(outside, 'utf8')).toBe('secret\n')
    })

    it('refuses when the path now answers with another device but the same inode', () => {
      givenDecisions('old\n')
      const otherDevice = ((path: string) => {
        const stats = lstatSync(path) as Stats
        return String(path).endsWith('decisions.jsonl')
          ? Object.assign(Object.create(stats), { dev: stats.dev + 1 })
          : stats
      }) as unknown as typeof lstatSync

      const result = appenderWith({ lstatSync: otherDevice })(worktree, decisionOf())

      expect(result).toEqual(refused(notRegular))
      expect(decisionsOnDisk()).toBe('old\n')
    })
  })

  describe('size ceiling', () => {
    const lineBytes = Buffer.byteLength(lineOf(decisionOf()))
    const fileOfSize = (size: number): void => givenDecisions(`${'x'.repeat(size - 1)}\n`)

    it('accepts an append that brings the file exactly to the ceiling', () => {
      fileOfSize(MAX_TEXT_LENGTH - lineBytes)

      const result = appendDecision(worktree, decisionOf())

      expect(result).toEqual({ accepted: true })
      expect(statSync(decisionsPath).size).toBe(MAX_TEXT_LENGTH)
    })

    it('refuses an append that would pass the ceiling by one byte', () => {
      fileOfSize(MAX_TEXT_LENGTH - lineBytes + 1)

      const result = appendDecision(worktree, decisionOf())

      expect(result).toEqual(refused(`exceeds ${MAX_TEXT_LENGTH} characters`))
      expect(statSync(decisionsPath).size).toBe(MAX_TEXT_LENGTH - lineBytes + 1)
    })

    it('counts the separator it must add', () => {
      givenDecisions('x'.repeat(MAX_TEXT_LENGTH - lineBytes))

      const result = appendDecision(worktree, decisionOf())

      expect(result).toEqual(refused(`exceeds ${MAX_TEXT_LENGTH} characters`))
    })

    it('counts bytes, not characters', () => {
      const wide = decisionOf({ title: 'é'.repeat(10) })
      const wideBytes = Buffer.byteLength(lineOf(wide))
      fileOfSize(MAX_TEXT_LENGTH - wideBytes + 1)

      expect(appendDecision(worktree, wide)).toEqual(refused(`exceeds ${MAX_TEXT_LENGTH} characters`))
    })
  })

  describe('writing', () => {
    it('writes the whole line when the file system accepts only seven bytes at a time', () => {
      givenDecisions('x\n')

      const result = appenderWith({ writeSync: sevenBytesAtATime })(worktree, decisionOf())

      expect(result).toEqual({ accepted: true })
      expect(decisionsOnDisk()).toBe(`x\n${lineOf(decisionOf())}`)
    })

    it.each<[string, Partial<DecisionAppenderIo>]>([
      ['a failing open', { openSync: failingDecisionsOpen }],
      ['a failing write', { writeSync: failure as never }],
      ['a failing read of the last byte', { readSync: failingLastByteRead }],
    ])('answers cannot be written after %s', (_name, fault) => {
      givenDecisions('x\n')

      const result = appenderWith(fault)(worktree, decisionOf())

      expect(result).toEqual(refused('cannot be written'))
      expect(decisionsOnDisk()).toBe('x\n')
    })

    it('refuses a file unlinked after it was opened', () => {
      const vanish = afterOpening(() => rmSync(decisionsPath))

      expect(appenderWith({ openSync: vanish })(worktree, decisionOf())).toEqual(refused(notRegular))
    })

    it('answers cannot be written when the path cannot be inspected after the open', () => {
      const unreadable = (() => failure()) as unknown as typeof lstatSync

      expect(appenderWith({ lstatSync: unreadable })(worktree, decisionOf())).toEqual(
        refused('cannot be written'),
      )
    })

    it('closes the plan before opening the decisions file, and each file once, after a successful append', () => {
      const { overrides, events } = descriptorEvents()

      const result = appenderWith(overrides)(worktree, decisionOf())

      expect(result).toEqual({ accepted: true })
      expect(events).toEqual(['open plan', 'close', 'open decisions', 'close'])
    })

    it('still closes the decisions file once after a failed write', () => {
      const { overrides, events } = descriptorEvents()

      appenderWith({ ...overrides, writeSync: failure as never })(worktree, decisionOf())

      expect(events).toEqual(['open plan', 'close', 'open decisions', 'close'])
    })

    it('still answers with the outcome when the close itself fails', () => {
      const result = appenderWith({ closeSync: failure })(worktree, decisionOf())

      expect(result).toEqual({ accepted: true })
    })

    it('opens the file for appending without following links', () => {
      const flags: number[] = []
      const spy = ((...args: Parameters<typeof openSync>) => {
        if (String(args[0]).endsWith('decisions.jsonl')) flags.push(args[1] as number)
        return openSync(...args)
      }) as typeof openSync

      appenderWith({ openSync: spy })(worktree, decisionOf())

      expect(flags).toHaveLength(1)
      const wanted =
        constants.O_RDWR | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK
      expect((flags[0] as number) & wanted).toBe(wanted)
    })
  })
})
