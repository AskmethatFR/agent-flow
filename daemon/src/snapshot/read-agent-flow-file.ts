import { constants } from 'node:fs'
import type * as NodeFs from 'node:fs'
import { join } from 'node:path'
import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import type { AgentFlowFile } from '@agent-flow/core/snapshot'

export type ReadIo = Pick<
  typeof NodeFs,
  'lstatSync' | 'realpathSync' | 'readlinkSync' | 'openSync' | 'fstatSync' | 'readSync' | 'closeSync'
>

const procDescriptors = '/proc/self/fd'

const procIsAbsent = (io: ReadIo): boolean => {
  try {
    io.lstatSync(procDescriptors)
    return false
  } catch {
    return true
  }
}

const descriptorMoved = (io: ReadIo, fd: number, path: string): boolean => {
  if (procIsAbsent(io)) return false
  try {
    return io.readlinkSync(`${procDescriptors}/${fd}`) !== path
  } catch {
    return true
  }
}

const readLimit = 4 * MAX_TEXT_LENGTH
const openFlags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK

const readBounded = (io: ReadIo, fd: number): AgentFlowFile => {
  const buffer = Buffer.allocUnsafe(readLimit + 1)
  let total = 0
  for (;;) {
    const count = io.readSync(fd, buffer, total, buffer.length - total, null)
    if (count === 0) break
    total += count
  }
  return total > readLimit ? { unavailable: 'too-large' } : buffer.toString('utf8', 0, total)
}

export const readAgentFlowFile = (
  io: ReadIo,
  realWorktree: string,
  name: 'plan.json',
): AgentFlowFile => {
  const directory = join(realWorktree, '.agent-flow')
  const path = join(directory, name)
  let fd: number | undefined
  try {
    if (!io.lstatSync(directory).isDirectory() || io.realpathSync(directory) !== directory) {
      return { unavailable: 'unreadable' }
    }
    fd = io.openSync(path, openFlags)
    const opened = io.fstatSync(fd)
    const linked = io.lstatSync(path)
    if (
      !opened.isFile() ||
      opened.dev !== linked.dev ||
      opened.ino !== linked.ino ||
      descriptorMoved(io, fd, path)
    ) {
      return { unavailable: 'unreadable' }
    }
    return readBounded(io, fd)
  } catch (error) {
    return { unavailable: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unreadable' }
  } finally {
    if (fd !== undefined) {
      try {
        io.closeSync(fd)
      } catch {}
    }
  }
}
