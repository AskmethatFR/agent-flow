import { closeSync, openSync, readSync, writeSync } from 'node:fs'
import { createDecisionAppender } from './decision-append'

export const appendDecision = createDecisionAppender({ openSync, readSync, writeSync, closeSync })
