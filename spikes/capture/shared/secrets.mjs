export const secretKey = /token|secret|key|auth|cookie|password|passwd|credential/i

export const tokenPatterns = [
  new RegExp("\\b" + "s" + "k-[A-Za-z0-9_-]{16,}"),
  new RegExp("\\b" + "s" + "k_(?:live|test)_[A-Za-z0-9]{16,}"),
  new RegExp("\\b" + "gh" + "[pousr]_[A-Za-z0-9]{20,}"),
  new RegExp("\\b" + "github" + "_pat_[A-Za-z0-9_]{20,}"),
  new RegExp("\\b" + "xo" + "x[abprs]-[A-Za-z0-9-]{10,}"),
  new RegExp("\\b" + "AK" + "IA[A-Z0-9]{16}\\b"),
  new RegExp("\\b" + "AI" + "za[A-Za-z0-9_-]{30,}"),
  new RegExp("Bearer\\s+[A-Za-z0-9._-]{20,}"),
  new RegExp("\\b" + "e" + "y[A-Za-z0-9_-]{8,}\\.e" + "y[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}"),
  new RegExp("-----BEGIN " + "[A-Z ]*PRIVATE KEY-----"),
  new RegExp("://[^/\\s:@]+:[^/\\s@]+@"),
]

export const pathLeakPatterns = [/\/home\//, /-home-/, /\/Users\//, /\/tmp\/claude-\d/]

export const findLeaks = (text) =>
  [...pathLeakPatterns, ...tokenPatterns].filter((re) => re.test(text)).map((re) => re.source)
