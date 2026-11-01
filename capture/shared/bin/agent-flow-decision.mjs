#!/usr/bin/env node
import { register } from 'tsx/esm/api'

register()

const { runDecisionCommand } = await import('../src/decision-append/command.ts')

process.exitCode = runDecisionCommand(process.argv.slice(2), (text) => process.stderr.write(text))
