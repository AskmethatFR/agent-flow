#!/usr/bin/env node
import { register } from 'tsx/esm/api'

register()

const { runContractCheckCommand } = await import('../src/contract-check/command.ts')

process.exitCode = runContractCheckCommand(
  process.argv.slice(2),
  (text) => process.stdout.write(text),
  (text) => process.stderr.write(text),
)
