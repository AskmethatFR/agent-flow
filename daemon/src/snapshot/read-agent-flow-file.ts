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
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
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

const chunkSize = 64 * 1024

const readBounded = (io: ReadIo, fd: number): AgentFlowFile => {
  const chunks: Buffer[] = []
  let total = 0
  for (;;) {
    const chunk = Buffer.allocUnsafe(chunkSize)
    const count = io.readSync(fd, chunk, 0, chunkSize, null)
    if (count === 0) break
    total += count
    if (total > readLimit) return { unavailable: 'too-large' }
    chunks.push(chunk.subarray(0, count))
  }
  return Buffer.concat(chunks).toString('utf8')
}

export const readAgentFlowFile = (
  io: ReadIo,
  realWorktree: string,
  name: 'plan.json' | 'decisions.jsonl',
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
      opened.nlink !== 1 ||
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
