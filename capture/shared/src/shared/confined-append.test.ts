import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_TEXT_LENGTH, checkContractFile } from '@agent-flow/core/contracts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendLine } from './confined-append'
import type { AppendIo } from './confined-append'
import { notRegularFile, refusalFor } from './confinement'

const realIo: AppendIo = { openSync, readSync, writeSync, closeSync, fstatSync, lstatSync }
const refuse = refusalFor('verified-facts.jsonl')

let root: string
let directory: string
let path: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'confined-append-')))
  directory = join(root, '.agent-flow')
  path = join(directory, 'verified-facts.jsonl')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

// A file of exactly `size` bytes ending with a newline, as the writer leaves it.
const fileOfSize = (size: number): void => writeFileSync(path, `${'x'.repeat(size - 1)}\n`)

describe('appendLine', () => {
  beforeEach(() => mkdirSync(directory))

  it('creates an absent file holding the line and a newline', () => {
    expect(appendLine(realIo, directory, path, 'one', refuse)).toEqual({ accepted: true })
    expect(readFileSync(path, 'utf8')).toBe('one\n')
  })

  it('appends after the existing lines', () => {
    writeFileSync(path, 'one\n')
    expect(appendLine(realIo, directory, path, 'two', refuse)).toEqual({ accepted: true })
    expect(readFileSync(path, 'utf8')).toBe('one\ntwo\n')
  })

  it('starts on a new line when the last existing line has no newline', () => {
    writeFileSync(path, 'one')
    expect(appendLine(realIo, directory, path, 'two', refuse)).toEqual({ accepted: true })
    expect(readFileSync(path, 'utf8')).toBe('one\ntwo\n')
  })

  it('refuses a symlinked file and leaves its target unchanged', () => {
    const outside = join(root, 'outside.jsonl')
    writeFileSync(outside, 'secret\n')
    symlinkSync(outside, path)

    expect(appendLine(realIo, directory, path, 'one', refuse)).toEqual(refuse(notRegularFile))
    expect(readFileSync(outside, 'utf8')).toBe('secret\n')
  })

  // O_NOFOLLOW itself: a link to an existing file is also refused by the later lstat identity check,
  // but a dangling link is only stopped at the open, since O_CREAT would otherwise create the target.
  it('refuses a dangling symlink and creates nothing at its target', () => {
    const outside = join(root, 'outside.jsonl')
    symlinkSync(outside, path)

    expect(appendLine(realIo, directory, path, 'one', refuse)).toEqual(refuse(notRegularFile))
    expect(existsSync(outside)).toBe(false)
  })

  describe('size ceiling', () => {
    const line = 'y'.repeat(99)
    const lineBytes = Buffer.byteLength(line) + 1

    it('accepts an append that brings the file exactly to MAX_TEXT_LENGTH', () => {
      fileOfSize(MAX_TEXT_LENGTH - lineBytes)

      expect(appendLine(realIo, directory, path, line, refuse)).toEqual({ accepted: true })
      expect(statSync(path).size).toBe(MAX_TEXT_LENGTH)
    })

    it('refuses whole an append that would pass MAX_TEXT_LENGTH by one byte, the file byte-identical', () => {
      fileOfSize(MAX_TEXT_LENGTH - lineBytes + 1)
      const before = readFileSync(path)

      expect(appendLine(realIo, directory, path, line, refuse)).toEqual(
        refuse(`exceeds ${MAX_TEXT_LENGTH} characters`),
      )
      expect(readFileSync(path).equals(before)).toBe(true)
    })

    it('counts the newline it must add before the line', () => {
      writeFileSync(path, 'x'.repeat(MAX_TEXT_LENGTH - lineBytes))

      expect(appendLine(realIo, directory, path, line, refuse)).toEqual(
        refuse(`exceeds ${MAX_TEXT_LENGTH} characters`),
      )
      expect(statSync(path).size).toBe(MAX_TEXT_LENGTH - lineBytes)
    })
  })

  // Residual risk (a): O_CREAT creates the file before any refusal, so a refusal on an absent file
  // leaves it empty. An empty file is a valid verified-facts.jsonl (no record, no error), so the
  // refused append leaves nothing a reader would take for a fact: it is pinned, not removed (an
  // unlink after the open could remove a file another writer had just made, in a directory that
  // may have been swapped).
  it('leaves an empty file, which the contract accepts, when it refuses an append on an absent file', () => {
    const tooLong = 'z'.repeat(MAX_TEXT_LENGTH)

    expect(appendLine(realIo, directory, path, tooLong, refuse)).toEqual(
      refuse(`exceeds ${MAX_TEXT_LENGTH} characters`),
    )
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf8')).toBe('')
    expect(checkContractFile('verified-facts.jsonl', '')).toEqual({ accepted: true })
  })

  // Residual risk (b): a write that throws after a partial write leaves a partial line, with no
  // newline. It is pinned, not repaired: the separator test above shows the next append starts on its
  // own line, and the contract check refuses the partial line (it is not valid JSON).
  describe('a write that throws after a partial write', () => {
    const failingAfterOneByte: AppendIo = {
      ...realIo,
      writeSync: ((fd: number, buffer: NodeJS.ArrayBufferView, offset: number) => {
        writeSync(fd, buffer, offset, 1)
        throw new Error('disk full')
      }) as unknown as typeof writeSync,
    }

    it('refuses with cannot be written and leaves the partial line', () => {
      expect(appendLine(failingAfterOneByte, directory, path, 'one', refuse)).toEqual(
        refuse('cannot be written'),
      )
      expect(readFileSync(path, 'utf8')).toBe('o')
      expect(checkContractFile('verified-facts.jsonl', 'o').accepted).toBe(false)
    })
  })
})
