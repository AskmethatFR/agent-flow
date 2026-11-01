import { readSync } from 'node:fs'
import { MAX_TEXT_LENGTH } from '@agent-flow/core/contracts'

const readLimit = 4 * MAX_TEXT_LENGTH

export function readBoundedInput(fd: number): string {
  const buffer = Buffer.allocUnsafe(readLimit + 1)
  let total = 0
  while (total < buffer.length) {
    const count = readSync(fd, buffer, total, buffer.length - total, null)
    if (count === 0) break
    total += count
  }
  return buffer.toString('utf8', 0, total)
}
