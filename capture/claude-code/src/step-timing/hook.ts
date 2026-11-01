export {}

try {
  const { captureStepTiming, readBoundedInput } = await import('./index')
  captureStepTiming(readBoundedInput(0), process.env.CLAUDE_PROJECT_DIR, () => new Date())
} catch {}
process.exit(0)
