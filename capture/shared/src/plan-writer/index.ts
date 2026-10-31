import { closeSync, fsyncSync, openSync, readSync, renameSync, unlinkSync, writeSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createPlanWriter } from './plan-writer'

export type { StepEvent } from './plan-writer'

export const applyStepEvent = createPlanWriter({
  openSync,
  readSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
  temporaryName: randomUUID,
})
