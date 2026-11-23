export {}

try {
  const { captureFact, readBoundedInput } = await import('./index')
  captureFact(readBoundedInput(0), process.env.CLAUDE_PROJECT_DIR, () => new Date())
} catch {}
process.exit(0)
