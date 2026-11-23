import { constants, realpathSync } from 'node:fs'
import type * as NodeFs from 'node:fs'
import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { attempt, codeOf, notRegularFile } from './confinement'
import type { Refuse } from './confinement'

export type AppendIo = Pick<
  typeof NodeFs,
  'openSync' | 'readSync' | 'writeSync' | 'closeSync' | 'fstatSync' | 'lstatSync'
>

const newline = 0x0a
const openFlags =
  constants.O_RDWR |
  constants.O_APPEND |
  constants.O_CREAT |
  constants.O_NOFOLLOW |
  constants.O_NONBLOCK

const separatorNeeded = (io: AppendIo, fd: number, size: number): boolean => {
  if (size === 0) return false
  const last = Buffer.alloc(1)
  io.readSync(fd, last, 0, 1, size - 1)
  return last[0] !== newline
}

export const appendLine = (
  io: AppendIo,
  directory: string,
  path: string,
  line: string,
  refuse: Refuse,
): ValidationResult => {
  let fd: number
  try {
    fd = io.openSync(path, openFlags, 0o666)
  } catch (error) {
    return codeOf(error) === 'ELOOP' ? refuse(notRegularFile) : refuse('cannot be written')
  }
  try {
    const stats = io.fstatSync(fd)
    if (!stats.isFile() || stats.nlink !== 1) return refuse(notRegularFile)
    if (realpathSync(directory) !== directory) return refuse('.agent-flow must be a real directory')
    const linked = io.lstatSync(path)
    if (linked.dev !== stats.dev || linked.ino !== stats.ino) return refuse(notRegularFile)
    const prefix = separatorNeeded(io, fd, stats.size) ? '\n' : ''
    const bytes = Buffer.from(`${prefix}${line}\n`)
    if (stats.size + bytes.length > MAX_TEXT_LENGTH) {
      return refuse(`exceeds ${MAX_TEXT_LENGTH} characters`)
    }
    let offset = 0
    while (offset < bytes.length) offset += io.writeSync(fd, bytes, offset)
    return { accepted: true }
  } catch {
    return refuse('cannot be written')
  } finally {
    attempt(() => io.closeSync(fd))
  }
}
