#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { register } from 'tsx/esm/api'

register({ tsconfig: fileURLToPath(new URL('../../../tsconfig.json', import.meta.url)) })

const { runPlanCommand } = await import('../src/plan-seed/command.ts')

process.exitCode = runPlanCommand(process.argv.slice(2), (text) => process.stderr.write(text))
