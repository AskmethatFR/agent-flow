import { closeSync, openSync, readdirSync, readSync } from 'node:fs'
import { createContractCheck } from './contract-check'

export const checkWorktree = createContractCheck({ openSync, readSync, closeSync, readdirSync })
