#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { register } from 'tsx/esm/api'

register({ tsconfig: fileURLToPath(new URL('../../../tsconfig.json', import.meta.url)) })

const { runContractCheckCommand } = await import('../src/contract-check/command.ts')

process.exitCode = runContractCheckCommand(
  process.argv.slice(2),
  (text) => process.stdout.write(text),
  (text) => process.stderr.write(text),
)
