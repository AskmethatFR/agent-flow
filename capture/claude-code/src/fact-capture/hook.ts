export {}

// The event carries no instant, so the hook's own clock is the end of the run: it is read before
// the module is imported and before stdin is read, to stay as near to the run end as the process
// start allows. The report is fresh only if it was written in [end - duration_ms, end].
const startedAt = new Date()
try {
  const { captureFact, readBoundedInput } = await import('./index')
  captureFact(readBoundedInput(0), process.env.CLAUDE_PROJECT_DIR, () => startedAt)
} catch {}
process.exit(0)
