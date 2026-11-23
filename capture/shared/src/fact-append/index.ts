import { closeSync, fstatSync, lstatSync, openSync, readSync, writeSync } from 'node:fs'
import { createFactAppender } from './fact-append'

export type { ObservedRun } from './fact-append'

export const appendFact = createFactAppender({
  openSync,
  readSync,
  writeSync,
  closeSync,
  fstatSync,
  lstatSync,
})
