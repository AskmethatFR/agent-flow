import * as fs from 'node:fs'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import { readAgentFlowFile } from './read-agent-flow-file'
import type { ReadIo } from './read-agent-flow-file'

const cap = 4 * MAX_TEXT_LENGTH
const realIo: ReadIo = fs

let root: string
let planPath: string

const directoryOf = (): string => join(root, '.agent-flow')

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'read-agent-flow-')))
  planPath = join(directoryOf(), 'plan.json')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const withPlan = (text: string | Buffer): void => {
  mkdirSync(directoryOf(), { recursive: true })
  writeFileSync(planPath, text)
}

const read = (io: ReadIo = realIo) => readAgentFlowFile(io, root, 'plan.json')

describe('readAgentFlowFile', () => {
  it('returns the text of a regular file', () => {
    withPlan('{"issue":"#1"}')
    expect(read()).toBe('{"issue":"#1"}')
  })

  it('decodes multi-byte text', () => {
    withPlan('héllo ✓')
    expect(read()).toBe('héllo ✓')
  })

  it('reads a file delivered in short chunks', () => {
    withPlan('abcdefghij')
    const chunked: ReadIo = {
      ...realIo,
      readSync: ((fd, buffer, offset, length, position) =>
        fs.readSync(fd, buffer, offset, Math.min(length, 3), position)) as ReadIo['readSync'],
    }
    expect(read(chunked)).toBe('abcdefghij')
  })

  it('accepts a file of exactly the cap', () => {
    withPlan(Buffer.alloc(cap, 0x61))
    const text = read()
    expect(typeof text === 'string' && text.length).toBe(cap)
  })

  it('refuses a file one byte over the cap as too-large', () => {
    withPlan(Buffer.alloc(cap + 1, 0x61))
    expect(read()).toEqual({ unavailable: 'too-large' })
  })

  it('reports a missing .agent-flow directory as missing', () => {
    expect(read()).toEqual({ unavailable: 'missing' })
  })

  it('reports a missing file as missing', () => {
    mkdirSync(directoryOf())
    expect(read()).toEqual({ unavailable: 'missing' })
  })

  it('reports a .agent-flow that is a regular file as unreadable', () => {
    writeFileSync(directoryOf(), 'x')
    expect(read()).toEqual({ unavailable: 'unreadable' })
  })

  it('reports a symlinked .agent-flow as unreadable', () => {
    const outside = join(root, 'outside')
    mkdirSync(outside)
    writeFileSync(join(outside, 'plan.json'), 'secret')
    symlinkSync(outside, directoryOf())
    expect(read()).toEqual({ unavailable: 'unreadable' })
  })

  it('reports a directory whose real path differs as unreadable', () => {
    withPlan('real')
    const moved: ReadIo = { ...realIo, realpathSync: (() => join(root, 'elsewhere')) as unknown as ReadIo['realpathSync'] }
    expect(read(moved)).toEqual({ unavailable: 'unreadable' })
  })

  it('reports a symlinked plan.json as unreadable', () => {
    mkdirSync(directoryOf())
    writeFileSync(join(root, 'elsewhere.json'), 'secret')
    symlinkSync(join(root, 'elsewhere.json'), planPath)
    expect(read()).toEqual({ unavailable: 'unreadable' })
  })

  it('reports a directory named plan.json as unreadable', () => {
    mkdirSync(planPath, { recursive: true })
    expect(read()).toEqual({ unavailable: 'unreadable' })
  })

  it('reports a FIFO named plan.json as unreadable without blocking', () => {
    mkdirSync(directoryOf())
    execFileSync('mkfifo', [planPath])
    expect(read()).toEqual({ unavailable: 'unreadable' })
  })

  it('reports a file swapped between lstat and open as unreadable', () => {
    withPlan('real')
    const swapped: ReadIo = {
      ...realIo,
      lstatSync: ((path: fs.PathLike, ...rest: unknown[]) => {
        const stats = (fs.lstatSync as (p: fs.PathLike, ...r: unknown[]) => fs.Stats)(path, ...rest)
        return String(path) === planPath ? Object.assign(Object.create(stats), { ino: stats.ino + 1 }) : stats
      }) as ReadIo['lstatSync'],
    }
    expect(read(swapped)).toEqual({ unavailable: 'unreadable' })
  })

  it('reports a device mismatch as unreadable', () => {
    withPlan('real')
    const swapped: ReadIo = {
      ...realIo,
      lstatSync: ((path: fs.PathLike, ...rest: unknown[]) => {
        const stats = (fs.lstatSync as (p: fs.PathLike, ...r: unknown[]) => fs.Stats)(path, ...rest)
        return String(path) === planPath ? Object.assign(Object.create(stats), { dev: stats.dev + 1 }) : stats
      }) as ReadIo['lstatSync'],
    }
    expect(read(swapped)).toEqual({ unavailable: 'unreadable' })
  })

  it('reports a descriptor whose real path is not the requested file as unreadable', () => {
    withPlan('real')
    const swapped: ReadIo = {
      ...realIo,
      readlinkSync: (() => join(root, 'elsewhere.json')) as unknown as ReadIo['readlinkSync'],
    }
    expect(read(swapped)).toEqual({ unavailable: 'unreadable' })
  })

  it('refuses the read when the descriptor path cannot be resolved', () => {
    withPlan('real')
    const noProc: ReadIo = {
      ...realIo,
      readlinkSync: (() => {
        throw Object.assign(new Error('no /proc'), { code: 'ENOENT' })
      }) as unknown as ReadIo['readlinkSync'],
    }
    expect(read(noProc)).toEqual({ unavailable: 'unreadable' })
  })

  it('asks for the real path of the descriptor it opened', () => {
    withPlan('real')
    const opened: number[] = []
    const asked: string[] = []
    const spying: ReadIo = {
      ...realIo,
      openSync: ((path: fs.PathLike, flag: number) => {
        const fd = fs.openSync(path, flag)
        opened.push(fd)
        return fd
      }) as ReadIo['openSync'],
      readlinkSync: ((path: fs.PathLike) => {
        asked.push(String(path))
        return fs.readlinkSync(path)
      }) as ReadIo['readlinkSync'],
    }
    expect(read(spying)).toBe('real')
    expect(asked).toEqual([`/proc/self/fd/${opened[0]}`])
  })

  it('reports a read error as unreadable and still closes the descriptor', () => {
    withPlan('real')
    const closed: number[] = []
    const failing: ReadIo = {
      ...realIo,
      readSync: () => {
        throw Object.assign(new Error('EIO'), { code: 'EIO' })
      },
      closeSync: (fd) => {
        closed.push(fd)
        fs.closeSync(fd)
      },
    }
    expect(read(failing)).toEqual({ unavailable: 'unreadable' })
    expect(closed).toHaveLength(1)
  })

  it('reports a file vanishing during the read as missing', () => {
    withPlan('real')
    const vanishing: ReadIo = {
      ...realIo,
      readSync: () => {
        throw Object.assign(new Error('gone'), { code: 'ENOENT' })
      },
    }
    expect(read(vanishing)).toEqual({ unavailable: 'missing' })
  })

  it('reports an open error other than ENOENT as unreadable and closes nothing', () => {
    withPlan('real')
    const closed: number[] = []
    const denied: ReadIo = {
      ...realIo,
      openSync: () => {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
      },
      closeSync: (fd) => {
        closed.push(fd)
      },
    }
    expect(read(denied)).toEqual({ unavailable: 'unreadable' })
    expect(closed).toEqual([])
  })

  it('opens read-only, no-follow and non-blocking', () => {
    withPlan('real')
    const flags: number[] = []
    const spying: ReadIo = {
      ...realIo,
      openSync: ((path: fs.PathLike, flag: number) => {
        flags.push(flag)
        return fs.openSync(path, flag)
      }) as ReadIo['openSync'],
    }
    read(spying)
    expect(flags).toEqual([fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK])
  })

  it('returns the text even when closing the descriptor fails', () => {
    withPlan('real')
    const noisy: ReadIo = {
      ...realIo,
      closeSync: (fd) => {
        fs.closeSync(fd)
        throw new Error('EIO')
      },
    }
    expect(read(noisy)).toBe('real')
  })
})
