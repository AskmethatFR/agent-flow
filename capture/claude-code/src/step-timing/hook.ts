import { readFileSync } from 'node:fs'
import { captureStepTiming } from './index'

try {
  captureStepTiming(readFileSync(0, 'utf8'), process.env.CLAUDE_PROJECT_DIR, () => new Date())
} catch {}
process.exit(0)
