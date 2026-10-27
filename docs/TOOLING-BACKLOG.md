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
