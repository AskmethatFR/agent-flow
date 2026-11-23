import { describe, expect, it } from 'vitest'
import { isVitestCommand } from './vitest-command'

const reporter = '--reporter=json'
const output = '--outputFile=reports/vitest/vitest.json'
const fixed = `vitest run ${reporter} ${output}`

describe('isVitestCommand', () => {
  it.each([
    ['the fixed form', fixed],
    ['the fixed form through npx', `npx ${fixed}`],
  ])('accepts %s', (_label, command) => {
    expect(isVitestCommand(command)).toBe(true)
  })

  it.each([
    ['no command', undefined],
    ['a number', 42],
    ['an empty command', ''],
    ['an echo into the report path', 'echo {} > reports/vitest/vitest.json'],
    ['a leading NODE_OPTIONS assignment', `NODE_OPTIONS=--require=x ${fixed}`],
    ['a leading VITEST_ assignment', `VITEST_MODE=x ${fixed}`],
    ['a leading AGENT_FLOW_ROLE assignment, refused until #130', `AGENT_FLOW_ROLE=qa ${fixed}`],
    ['npx twice', `npx npx ${fixed}`],
    ['an npx option', `npx -y ${fixed}`],
    ['another runner', `npx vite run ${reporter} ${output}`],
    ['no run subcommand', `npx vitest ${reporter} ${output}`],
    ['the watch subcommand', `npx vitest watch ${reporter} ${output}`],
    ['a leading space', ` ${fixed}`],
    ['two spaces after npx', `npx  ${fixed}`],
    ['a tab after npx', `npx\t${fixed}`],
    ['an upper-case runner', `npx VITEST run ${reporter} ${output}`],
  ])('refuses %s', (_label, command) => {
    expect(isVitestCommand(command)).toBe(false)
  })

  it('accepts the two fixed flags in either order', () => {
    expect(isVitestCommand(`npx vitest run ${output} ${reporter}`)).toBe(true)
  })

  it.each([
    ['no flag', 'npx vitest run'],
    ['no reporter', `npx vitest run ${output}`],
    ['no output file', `npx vitest run ${reporter}`],
    ['the reporter twice', `npx ${fixed} ${reporter}`],
    ['the output file twice', `npx ${fixed} ${output}`],
    ['another output file', `npx vitest run ${reporter} --outputFile=reports/vitest/other.json`],
    ['another output file next to the fixed one', `npx ${fixed} --outputFile=/tmp/vitest.json`],
    ['an output file split from its flag', `npx vitest run ${reporter} --outputFile reports/vitest/vitest.json`],
    ['another reporter', `npx vitest run --reporter=verbose ${output}`],
    ['a second reporter', `npx ${fixed} --reporter=verbose`],
    ['the reporters flag', `npx ${fixed} --reporters=json`],
    ['a configuration file', `npx ${fixed} --config x`],
    ['a short configuration file', `npx ${fixed} -c x`],
    ['the configFile flag', `npx ${fixed} --configFile=x`],
    ['another root', `npx ${fixed} --root=/tmp`],
    ['another dir', `npx ${fixed} --dir=/tmp`],
    ['a json format into another path', `npx ${fixed} --format=json:/tmp/x.json`],
    ['the watch flag', `npx ${fixed} --watch`],
    ['a trailing space', `npx ${fixed} `],
    ['two spaces between the flags', `npx vitest run ${reporter}  ${output}`],
    ['a chained command', `npx ${fixed}; true`],
    ['a chained command after a space', `npx ${fixed} && true`],
    ['a pipe', `npx ${fixed} | tee x`],
    ['a background run', `npx ${fixed} &`],
    ['a redirection', `npx ${fixed} > x`],
    ['a newline then another command', `npx ${fixed}\ntrue`],
    ['a quoted reporter', `npx vitest run '--reporter=json' ${output}`],
    ['a double-quoted output file', `npx vitest run ${reporter} "${output}"`],
    ['an escaped reporter', `npx vitest run \\${reporter} ${output}`],
    ['a command substitution', `npx ${fixed} $(true)`],
    ['a backquoted substitution', `npx ${fixed} \`true\``],
  ])('refuses %s', (_label, command) => {
    expect(isVitestCommand(command)).toBe(false)
  })

  it.each([
    ['a one-character project', `${fixed} --project=a`],
    ['a 64-character project', `${fixed} --project=${'a'.repeat(64)}`],
    ['a project of every allowed character', `${fixed} --project=AZaz09_-`],
    ['two projects', `${fixed} --project=core --project=capture-shared`],
    ['the same project twice', `${fixed} --project=core --project=core`],
    ['a project before the fixed flags', `vitest run --project=core ${reporter} ${output}`],
    ['a project between the fixed flags', `vitest run ${reporter} --project=core ${output}`],
  ])('accepts %s', (_label, command) => {
    expect(isVitestCommand(command)).toBe(true)
  })

  it.each([
    ['an empty project', `${fixed} --project=`],
    ['a 65-character project', `${fixed} --project=${'a'.repeat(65)}`],
    ['a project with a dot', `${fixed} --project=a.b`],
    ['a project with a slash', `${fixed} --project=a/b`],
    ['a project with a glob', `${fixed} --project=a*`],
    ['a project with a trailing semicolon', `${fixed} --project=a;`],
    ['a project with a leading character', `${fixed} x--project=a`],
    ['a project split from its flag', `${fixed} --project core`],
    ['a project with a single dash', `${fixed} -project=core`],
    ['an upper-case project flag', `${fixed} --PROJECT=core`],
  ])('refuses %s', (_label, command) => {
    expect(isVitestCommand(command)).toBe(false)
  })

  it.each([
    ['a one-character path filter', `${fixed} a`],
    ['a path filter starting with a digit', `${fixed} 0`],
    ['a path filter starting with an underscore', `${fixed} _a`],
    ['a 256-character path filter', `${fixed} a${'b'.repeat(255)}`],
    ['a path filter of every allowed character', `${fixed} aAZaz09_./-`],
    ['a path to a test file', `${fixed} capture/claude-code/src/fact-capture/vitest-command.test.ts`],
    ['a path filter ending with a slash', `${fixed} core/`],
    ['two path filters and a project', `${fixed} core --project=core tests/a.test.ts`],
    ['a path filter before the fixed flags', `npx vitest run core ${reporter} ${output}`],
    ['a path filter named like the runner', `${fixed} vitest`],
  ])('accepts %s', (_label, command) => {
    expect(isVitestCommand(command)).toBe(true)
  })

  it.each([
    ['a 257-character path filter', `${fixed} a${'b'.repeat(256)}`],
    ['a path filter starting with a dot', `${fixed} .a`],
    ['a path filter starting with a slash', `${fixed} /etc`],
    ['a path filter starting with a dash', `${fixed} -a`],
    ['a parent directory alone', `${fixed} ..`],
    ['a parent directory inside a path', `${fixed} a/../b`],
    ['a parent directory at the end of a path', `${fixed} a/..`],
    ['two dots inside a name', `${fixed} a..b`],
    ['a glob', `${fixed} tests/*.test.ts`],
    ['a path filter with a trailing semicolon', `${fixed} a;`],
    ['a path filter with an equals sign', `${fixed} a=b`],
    ['a home path', `${fixed} ~/x`],
    ['a path filter with a variable', `${fixed} a$HOME`],
  ])('refuses %s', (_label, command) => {
    expect(isVitestCommand(command)).toBe(false)
  })
})
