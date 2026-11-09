import { randomUUID } from 'node:crypto'
import { closeSync, fsyncSync, linkSync, openSync, readSync, unlinkSync, writeSync } from 'node:fs'
import { createPlanSeeder } from './plan-seed'

export { isExistingPlanRefusal } from './plan-seed'

export const seedPlan = createPlanSeeder({
  openSync,
  readSync,
  writeSync,
  fsyncSync,
  closeSync,
  linkSync,
  unlinkSync,
  temporaryName: randomUUID,
})
