import { closeSync, fsyncSync, openSync, readSync, renameSync, unlinkSync, writeSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createPlanBatchWriter, createPlanStepAdder, createPlanWriter } from './plan-writer'

export type { NewStep, PlanOperation, StepEvent } from './plan-writer'

const io = {
  openSync,
  readSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
  temporaryName: randomUUID,
}

export const applyStepEvent = createPlanWriter(io)

export const addPlanStep = createPlanStepAdder(io)

export const applyPlanOperations = createPlanBatchWriter(io)
