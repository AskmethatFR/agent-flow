import { constants, realpathSync } from 'node:fs'
import type * as NodeFs from 'node:fs'
import { join } from 'node:path'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { attempt, codeOf, refusalFor } from './confinement'

export type AtomicWriteIo = Pick<
  typeof NodeFs,
  'openSync' | 'writeSync' | 'fsyncSync' | 'closeSync' | 'unlinkSync'
> & { readonly temporaryName: () => string }

export type ReplaceIo = AtomicWriteIo & Pick<typeof NodeFs, 'renameSync'>

export type CreateIo = AtomicWriteIo & Pick<typeof NodeFs, 'linkSync'>

type Publish = (temporary: string) => ValidationResult

export const alreadyExists = 'already exists'

const refuse = refusalFor('plan.json')

const writeAtomically = (
  io: AtomicWriteIo,
  directory: string,
  text: string,
  mode: number,
  publish: Publish,
): ValidationResult => {
  const temporary = join(directory, `.plan.json.${io.temporaryName()}.tmp`)
  let fd: number | undefined
  let created = false
  const failed = (): ValidationResult => {
    if (fd !== undefined) attempt(() => io.closeSync(fd as number))
    if (created) attempt(() => io.unlinkSync(temporary))
    return refuse('cannot be written')
  }
  try {
    fd = io.openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode)
    created = true
    const bytes = Buffer.from(text)
    let offset = 0
    while (offset < bytes.length) offset += io.writeSync(fd, bytes, offset)
    io.fsyncSync(fd)
    const closing = fd
    fd = undefined
    io.closeSync(closing)
    if (realpathSync(directory) !== directory) return failed()
    return publish(temporary)
  } catch {
    return failed()
  }
}

export const createAtomically = (
  io: CreateIo,
  directory: string,
  planPath: string,
  text: string,
  mode: number,
): ValidationResult =>
  writeAtomically(io, directory, text, mode, (temporary) => {
    try {
      io.linkSync(temporary, planPath)
    } catch (error) {
      if (codeOf(error) !== 'EEXIST') throw error
      attempt(() => io.unlinkSync(temporary))
      return refuse(alreadyExists)
    }
    attempt(() => io.unlinkSync(temporary))
    return { accepted: true }
  })

export const replaceAtomically = (
  io: ReplaceIo,
  directory: string,
  planPath: string,
  text: string,
  mode: number,
): ValidationResult =>
  writeAtomically(io, directory, text, mode, (temporary) => {
    io.renameSync(temporary, planPath)
    return { accepted: true }
  })
