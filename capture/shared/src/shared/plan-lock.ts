import { closeSync, constants, fstatSync, lstatSync, openSync, unlinkSync } from 'node:fs'
import type * as NodeFs from 'node:fs'
import type { Stats } from 'node:fs'
import type { ValidationResult } from '@agent-flow/core/contracts'
import { attempt, codeOf } from './confinement'
import type { Refuse, Rejected } from './confinement'

export type LockPolicy = {
  readonly waitMs: number
  readonly staleAfterMs: number
}

export type LockIo = Pick<typeof NodeFs, 'openSync' | 'closeSync' | 'fstatSync' | 'lstatSync' | 'unlinkSync'>

type Identity = { readonly dev: number; readonly ino: number }

export const defaultLockPolicy: LockPolicy = { waitMs: 5_000, staleAfterMs: 30_000 }

export const lockFileName = '.plan.lock'

const nodeLockIo: LockIo = { openSync, closeSync, fstatSync, lstatSync, unlinkSync }

const pollMs = 5

const sleep = (milliseconds: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

const identityOf = (io: LockIo, descriptor: number): Identity | undefined => {
  let identity: Identity | undefined
  attempt(() => {
    const { dev, ino } = io.fstatSync(descriptor)
    identity = { dev, ino }
  })
  return identity
}

const claim = (io: LockIo, lockPath: string, refuse: Refuse): Identity | false | Rejected => {
  let descriptor: number
  try {
    const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW
    descriptor = io.openSync(lockPath, flags, 0o600)
  } catch (error) {
    return codeOf(error) === 'EEXIST' ? false : refuse('cannot be locked')
  }
  const identity = identityOf(io, descriptor)
  attempt(() => io.closeSync(descriptor))
  if (identity !== undefined) return identity
  attempt(() => io.unlinkSync(lockPath))
  return refuse('cannot be locked')
}

const entryAt = (io: LockIo, lockPath: string): Stats | undefined => {
  let entry: Stats | undefined
  attempt(() => {
    entry = io.lstatSync(lockPath)
  })
  return entry
}

const judgeHeldLock = (io: LockIo, lockPath: string, policy: LockPolicy, refuse: Refuse): Rejected | undefined => {
  const held = entryAt(io, lockPath)
  if (held === undefined) return undefined
  if (!held.isFile()) return refuse('lock must be a regular file, not a link')
  if (Math.abs(Date.now() - held.mtimeMs) > policy.staleAfterMs) {
    return refuse(`is locked by a stale lock file; remove .agent-flow/${lockFileName}`)
  }
  return undefined
}

const acquire = (io: LockIo, lockPath: string, policy: LockPolicy, refuse: Refuse): Identity | Rejected => {
  const deadline = performance.now() + policy.waitMs
  for (;;) {
    const claimed = claim(io, lockPath, refuse)
    if (claimed !== false) return claimed
    const verdict = judgeHeldLock(io, lockPath, policy, refuse)
    if (verdict !== undefined) return verdict
    if (performance.now() >= deadline) {
      return refuse(`is busy; remove .agent-flow/${lockFileName} only if no write is running`)
    }
    sleep(pollMs)
  }
}

const release = (io: LockIo, lockPath: string, held: Identity): void =>
  attempt(() => {
    const current = io.lstatSync(lockPath)
    if (current.dev === held.dev && current.ino === held.ino) io.unlinkSync(lockPath)
  })

export const withLock = (
  lockPath: string,
  policy: LockPolicy,
  refuse: Refuse,
  work: () => ValidationResult,
  io: LockIo = nodeLockIo,
): ValidationResult => {
  const acquired = acquire(io, lockPath, policy, refuse)
  if ('accepted' in acquired) return acquired
  try {
    return work()
  } finally {
    release(io, lockPath, acquired)
  }
}
