---
id: "real-issue-run"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-11-05"
relations:
  depends-on: ["capture-events", "agent-rules", "plan-writer-confinement"]
answers:
  - "How is a target project set up so a real issue is captured by Claude Code or OpenCode v2 agents?"
  - "How is it proven that no human edited any file under .agent-flow/ during a real-issue run?"
  - "How does QA judge a real-issue capture run, and what does agent-flow-check verify versus what QA checks by hand?"
  - "Where does the evidence of a real-issue run live, and what may be committed?"
decided_in:
  - "#17"
---

# Real-issue capture run: setup, AC4 evidence, QA procedure

> **One-liner**: The runbook for the manual Phase 1 exit scenario (`features/phase-1/real-issue-capture.feature` S1): how each runtime is wired into a target project, how "no human edited `.agent-flow/`" is evidenced, and how QA reaches a verdict. Used by #80 (Claude Code) and #81 (OpenCode v2).
> **Links**: [[capture-events]] (runtime preconditions, `:63-64`), [[agent-rules]] (rule shims and the decision command), [[plan-writer-confinement]] (the confinement chain the check reuses; temp-file naming, step 5).

## Context

S1 is tagged `@manual`: no BDD driver can make real agents work a real issue. The run is repeatable only if setup, evidence and verdict are fixed before anyone runs it. Everything below runs in the **target project**; nothing is placed under its `.agent-flow/` by hand. `AGENT_FLOW_HOME` is an Agent Flow checkout at a recorded commit, with `npm ci` done (the Claude Code hook and both commands run through its `tsx`).

## 1. Setup per runtime

| Concern | Claude Code | OpenCode v2 |
|---|---|---|
| Agent Flow location | `export AGENT_FLOW_HOME=<abs>` | `export AGENT_FLOW_HOME=<abs>` |
| Rule loading | project `CLAUDE.md` holds the line `@<abs>/rules/claude-code/CLAUDE.md` | `export OPENCODE_CONFIG=<abs>/rules/opencode/opencode.json`, written absolute, never through `$AGENT_FLOW_HOME` (an unset variable would yield a silently missing path) |
| Step timing | `--settings <abs>/capture/claude-code/settings.json` (the `PostToolUse` `TaskUpdate` hook) | `export AGENT_FLOW_WORKTREE=<abs-worktree>` (absolute, no `.`/`..` segment, or the plugin stays inert or every write is refused); project plugin entry under `.opencode/plugins/` that re-exports `<abs>/capture/opencode/src/step-timing/entry.ts` |
| Plan tool | `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` and the task tools named in `--tools`/`--allowedTools` (`capture-events` `:63`) | project `opencode.json` with `experimental.todo: true` (`capture-events` `:64`) |
| Decision command | a Bash allow rule matching `node *agent-flow-decision.mjs*`; record the exact rule used | allowed by the project permission config; record the exact entry used |
| Launch | `claude` with the flags above, from the worktree root | `opencode run --standalone` from the worktree root (`capture-events` `:85`, `:109`) |
| First plan | seeded by the mechanism #78 delivers; no run starts before it exists | same |
| Versions recorded | `claude --version`, `node --version` | `opencode --version`, `node --version` |

The OpenCode setup above is the setup as of today: `{env:AGENT_FLOW_HOME}` in the rule shim fails open when the variable is unset. #79 adds the guard that makes it fail loudly; once it lands, the setup gains that guard and nothing else changes.

## 2. AC4 evidence protocol: no human edit under `.agent-flow/`

| Phase | Action, run by the operator | Kept |
|---|---|---|
| Before | `test ! -e <wt>/.agent-flow; echo $?` and `git -C <wt> rev-parse HEAD` | both outputs |
| During | from `<wt>`: `while sleep 5; do date -u +%FT%TZ; sha256sum .agent-flow/* .agent-flow/.[!.]* 2>/dev/null; stat -c '%n %s %y' .agent-flow/* .agent-flow/.[!.]* 2>/dev/null; done >> <outside-wt>/snapshots.log` | `snapshots.log` |
| After | the check command (below), then a final `sha256sum` of every entry | outputs, hashes |
| Attestation | one line, signed by the operator: "I did not edit, create, move or delete any file under `.agent-flow/` during this run." | the line |

The loop runs from the worktree so the log holds relative names only, never a home path. The second glob makes dot-files, such as the plan writer's temp file, visible. `stat -c` and `sha256sum` are GNU coreutils; on macOS use their GNU equivalents.

**Verdict rule.** The log holds hashes and sizes, not content, so it is read against the final files, window by window (a window is two consecutive stamps; `date -u` has one-second granularity):

| Observed change | Explained only when | Otherwise |
|---|---|---|
| `.agent-flow/` and `plan.json` first appear | the seeding step (#78) ran in that window, as the operator recorded | AC4 fail |
| `plan.json` hash changes | the window contains at least one `startedAt` or `endedAt` value of the final `plan.json`; conversely, every such value falls in a window where the hash changed | AC4 fail |
| `decisions.jsonl` appears or changes | its size never shrinks, every logged size is the byte length of a whole-line prefix of the final file, and the lines added in the window carry an `at` inside it | AC4 fail |
| any other entry appears | it is a `.plan.json.<uuid>.tmp` seen in one window and gone in the next ([[plan-writer-confinement]] step 5) | AC4 fail |

Any AC4 fail is a defect, filed and linked in section 6.

## 3. QA procedure per runtime

The check command is read-only and validates each file on its own; cross-file checks are QA's, by hand.

| Check | How | Pass |
|---|---|---|
| Contract | `node "$AGENT_FLOW_HOME/capture/shared/bin/agent-flow-check.mjs" <abs-worktree>` | exit 0, stdout `{"checked":[…]}` naming every file present |
| Steps timed | every step in `plan.json` | `status` is `done`, `startedAt` and `endedAt` non-null, `endedAt >= startedAt` |
| Decisions per role | distinct `role` of started plan steps, versus distinct `role` in `decisions.jsonl` lines | the first set is included in the second |
| No human edit | section 2 verdict rule | no unexplained change, attestation present |

Check command contract, as built: exit 1 with `{"errors":[…]}` on stderr on any violation or unsafe layout; exit 2 with `usage: agent-flow-check <worktree>` on a wrong argument count. It needs neither `plan.json` nor `decisions.jsonl` to exist. It applies steps 1 to 4 of the [[plan-writer-confinement]] chain to every contract-named entry, re-confirms `.agent-flow` is the same real directory after the reads, and reports any other entry by name without opening it. A leftover `.plan.json.*.tmp` after the run therefore fails the check, and that is a defect too.

## 4. Results

| Runtime | Runtime version | Issue | Agent Flow commit | Timed | Decisions per role | Check | AC4 | Defects filed |
|---|---|---|---|---|---|---|---|---|
| Claude Code | pending #80 | | | | | | | |
| OpenCode v2 | pending #81 | | | | | | | |

#80 runs first. #81 runs after #79 and #80.

## 5. Evidence

| Rule | Detail |
|---|---|
| Location | `docs/technical/capture/evidence/real-issue-run/<runtime>/`, as `docs/technical/paseo/evidence/` |
| Kept | `snapshots.log`, check output, final hashes, attestation, and copies of the final `plan.json` and `decisions.jsonl` |
| Before any copy | scan every kept file for secrets and home paths (patterns: `spikes/capture/shared/secrets.mjs:1-19`) |
| On a hit | commit hashes only, never the file, and file a defect against #16 (`rules/decision-logging.md:48` forbids secrets in decisions) |

## 6. Gaps

| Gap | Owner |
|---|---|
| Nothing seeds `.agent-flow/plan.json` on a real run; it blocks both runs | #78 |
| OpenCode fails open when `AGENT_FLOW_HOME` is unset | #79 |
| The decision template has not run live under zsh or bash 3.2 (`agent-rules` `:69`) | #80, #81: record the shell used; a failure is a defect |
| Install friction met during a run | a defect per friction, linked here |

## Consequences / Constraints

- **MUST**: a real-issue run follows sections 1 to 3 as written; a deviation is recorded in the results row, never absorbed silently.
- **MUST**: the snapshot log and every copied file stay outside the worktree until scanned.
- **MUST NOT**: any human or script other than the agents' capture path touch `.agent-flow/` during a run, the seeding step excepted.
- **MUST NOT**: commit a file the scan flagged.
- **Out of scope**: how `plan.json` is seeded (#78), the OpenCode unset-variable guard (#79), automating this procedure.

## Open questions / Gaps

- [ ] The OpenCode plugin re-export under `.opencode/plugins/` has not been loaded by a live OpenCode yet; #81 confirms it or files a defect.
