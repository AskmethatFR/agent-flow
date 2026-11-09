# Tooling backlog

Internal tooling needs (scripts, hooks, commands). Never filed as GitHub issues.

## 2026-10-27 — TDD audit and stall watch blind to OpenCode lane transcripts (observed on #32)

`tdd_audit.py` matches tool calls named `Bash` only; OpenCode's harness records
shell calls as `shell`, so every audit on an OpenCode lane reports `no-runs`
whatever the lane actually ran. `subagent_stall_watch.py` inherits the same
transcript-shape blind spots: it fires `stall` on worktree file-tool calls the
permission layer blocks (`external_directory`) while the lane is healthy, and
`watch-inconclusive` on lanes that completed normally. Observed across six
lanes on #32 (three `no-runs` audits, four false `stall` alerts, two
`watch-inconclusive` on completed lanes). Fix: accept `shell` alongside `Bash`
when parsing transcripts, and treat a permission-blocked tool call as a
non-idle event. Related: lane read access to `team-context/contracts/*.md` is
denied, so lanes fall back to the contract text embedded in their spawn.

## 2026-11-05 — `tdd-run.sh` misroutes scoped runs under workspace packages; `--mutate` blind to JS (observed on #79)

`detect_family` walks up from the test file and stops at the first
`package.json`, so a workspace package without its own vitest config (here
`capture/opencode`) is classified `npm-test` and a scoped run dies with
`Missing script: "test"`. Fix: prefer a repo-root `vitest.config.*` over a
nearest `package.json` without test config. Separately, `--mutate` prints
`MUTATION_SCORE: not_applicable (javascript)` although StrykerJS is configured
(`stryker.config.json`, threshold 100) — wire Stryker as the JS mutation tool or
name the project-level gate explicitly. Workaround in use on #79: scoped runs
via `npx vitest run <file> -t <name> --bail=1 --reporter=dot
--passWithNoTests=false` from the repo root, mutation via `npx stryker run`.

Re-observation on #79 of the 2026-10-27 blind spot: `tdd_audit.py:873-874`
pairs only tool calls named `Bash` while OpenCode records `shell` (74 such
calls went unread in one lane's transcript → false `no-runs`), and the stall
watch fired `stall` on already-completed/cancelled lanes. Same fixes apply.

## 2026-11-07 — jbcontext-first gate blocks the decision command (observed on #80)

The `jbcontext-first` PreToolUse gate refused a lane's `agent-flow-decision.mjs`
call (the `rules/decision-logging.md:27` template) because the lane had not run
a semantic search yet. The template embeds `$(git rev-parse --show-toplevel)`
and a `cat` heredoc, which the gate reads as code discovery. The decision is
lost unless the lane retries after a search. The gate also refuses a plain
`grep -c` on a named file in the worktree. Fix: exempt commands that invoke
`agent-flow-decision.mjs`, and lookups in named files, from the gate.

## 2026-11-09 — a fresh worktree has no dependencies and the lane tooling assumes it does (observed on #20)

A new worktree has no `node_modules`, and a Dev lane may not install, so the
first Dev spawn on #20 ended `blocked` with no code written. Three tools made
it worse: bare `npx cucumber-js` resolved to a dependency-confusion placeholder
package instead of the project binary, `tdd-run.sh <file>::<name>` runs from
`panel/` where no vitest config exists (`Missing script: "test"`), and
`deploy/run-tests.sh`, named in the QA and Dev-B spawn prompts, does not exist
in this repo. Fix: a worktree-start step that runs `npm ci` from the lockfile,
`tdd-run.sh` resolving the vitest root for a JS repo, and the spawn prompts
naming `npm test` / `npm run bdd` where `deploy/run-tests.sh` is absent.
