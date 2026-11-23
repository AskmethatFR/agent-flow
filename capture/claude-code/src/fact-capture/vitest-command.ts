// The command is untrusted text: it is accepted only when it matches, whole, the closed grammar
// below (docs/technical/decisions/verified-facts.md, S14). It is split on single spaces only, so
// an empty token (two spaces, a leading or trailing one) and any character outside the
// productions, quotes, `$`, `\`, globs and shell operators included, refuse the command.
// After `[npx ]vitest run`, the tokens may come in any order; each fixed flag exactly once.
const reporter = '--reporter=json'
const outputFile = '--outputFile=reports/vitest/vitest.json'

const project = /^--project=[A-Za-z0-9_-]{1,64}$/

// Two dots anywhere refuse a path filter, `a..b` included: no filter needs them.
const pathFilter = /^[A-Za-z0-9_][A-Za-z0-9_./-]{0,255}$/

const production = (token: string): boolean =>
  token === reporter ||
  token === outputFile ||
  project.test(token) ||
  (pathFilter.test(token) && !token.includes('..'))

const once = (tokens: readonly string[], flag: string): boolean => tokens.filter((token) => token === flag).length === 1

export function isVitestCommand(command: unknown): boolean {
  if (typeof command !== 'string') return false
  const tokens = command.split(' ')
  const [name, subcommand, ...options] = tokens[0] === 'npx' ? tokens.slice(1) : tokens
  if (name !== 'vitest' || subcommand !== 'run') return false
  return once(options, reporter) && once(options, outputFile) && options.every(production)
}
