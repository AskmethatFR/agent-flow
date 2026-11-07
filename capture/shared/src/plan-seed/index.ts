import { randomUUID } from 'node:crypto'
import { closeSync, fsyncSync, linkSync, openSync, unlinkSync, writeSync } from 'node:fs'
import { createPlanSeeder } from './plan-seed'

export const seedPlan = createPlanSeeder({
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  linkSync,
  unlinkSync,
  temporaryName: randomUUID,
})
