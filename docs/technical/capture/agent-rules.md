---
id: "agent-rules"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-11-08"
relations:
  depends-on: ["decisions-jsonl-schema", "capture-events"]
  related: ["host-adapter-boundary", "snapshot-decisions", "workspace-layout-core-boundary"]
answers:
  - "Where do the agent rules live, and how is one rule kept identical across Claude Code and OpenCode?"
  - "How does each runtime load an agent rule?"
  - "What may a shim under rules/ hold, and where does decision logic go instead?"
  - "How does OpenCode refuse to run when AGENT_FLOW_HOME does not name the checkout?"
  - "How does an agent write a decision to decisions.jsonl, and which fields does it fill itself?"
  - "How is the worktree argument of the decision command resolved in each runtime?"
  - "How does the command template keep agent-written text away from the shell?"
  - "Where do the role ids written into decisions.jsonl come from, and can they change?"
decided_in:
  - "#16"
  - "#79"
  - "#83"
---

# Agent rules: one runtime-neutral source, per-runtime shims

> **One-liner**: Agent rules live in `rules/`: one runtime-neutral Markdown file per rule, plus a thin native shim per runtime that points at it and holds no decision. The decision-logging rule gives the agent one shell template. The template calls the #35 decision command and keeps the agent's text as data, never as shell code.
> **Links**: [[decisions-jsonl-schema]] (the frozen contract each line must pass), [[capture-events]] (role verdict: rule-driven role source, `:95`), [[host-adapter-boundary]] (capture writes only under `.agent-flow/`), [[snapshot-decisions]] (the reader that groups lines by `step`), [[workspace-layout-core-boundary]] (`rules/` is not a workspace package).

## Context

The capture spike showed that no runtime event names the role on a plan-item event. It recommended a rule-driven role source instead (`docs/technical/capture/events.md:93-95`). #35 already shipped the only confined, schema-checked writer for `decisions.jsonl` (`capture/shared/bin/agent-flow-decision.mjs`). Before #16 there was no agent rule of any kind in the repository. Claude Code and OpenCode each load instruction text through their own native mechanism, and two hand-kept copies of one rule would drift.

## Decision / Specification

| Concern | Decision | Rationale |
|---|---|---|
| Location | Top-level `rules/`. One runtime-neutral source per rule, `rules/<rule>.md`. Per-runtime shims sit under `rules/<runtime>/`. Shims hold pointers and thin launchers, never decisions: a shim only points at a source or at code under `capture/<runtime>/src`, and any check it runs lives there. `rules/` is not a workspace package. | One source, so the runtimes match by construction. A shim is the smallest thing a runtime or a shell can load natively. Logic in a shim would escape the Stryker gate, which mutates only `capture/<runtime>/src/**/*.ts`. |
| Claude Code loading | `rules/claude-code/CLAUDE.md` holds a single `@../decision-logging.md` memory import. | This is the native CLAUDE.md import, so no hook or plugin code is needed. |
| OpenCode loading | `rules/opencode/opencode.json` holds an `instructions` entry `{env:AGENT_FLOW_HOME}/rules/<rule>.md` and a `plugins` entry for the rule guard. The operator starts OpenCode through the launcher `rules/opencode/agent-flow-opencode`, by its real path. | `instructions` is OpenCode's include mechanism. AGENTS.md does not follow file references. |
| `AGENT_FLOW_HOME` check on OpenCode | `{env:AGENT_FLOW_HOME}` fails open, so the check runs at two points that share one predicate (`namesCheckout`). The launcher runs it before OpenCode starts: on refusal it prints one stderr line naming the variable, never its value, and exits non-zero without starting OpenCode. On acceptance it `exec`s `opencode` with the arguments unchanged. The rule guard runs it again inside the session and ends the session on refusal. | The launcher makes the refusal visible on the console; the guard's line only shows under `--print-logs`. One predicate means the two points cannot accept different values. |
| Launcher trust | The launcher finds `tsx`, `tsconfig.json` and its check from its own physical directory, never from `AGENT_FLOW_HOME` or the working directory, and passes that `tsconfig.json` explicitly. Any non-zero status from the check, including a missing `tsx`, stops it before `opencode` runs. | `AGENT_FLOW_HOME` is untrusted until checked, and the working directory is the target project. Failing closed covers a broken install as well as a wrong value. |
| Write path | The rule's only write instruction is `node "${AGENT_FLOW_HOME:?}/capture/shared/bin/agent-flow-decision.mjs" <worktree> <json>`. Any other write to `.agent-flow/decisions.jsonl` is forbidden. | The #35 command is the one writer that checks the frozen schema and confines the write. `:?` fails loudly when the variable is unset, as the step-timing hook does. |
| Worktree argument | `${AGENT_FLOW_WORKTREE:-$(git rev-parse --show-toplevel 2>/dev/null)}` | On OpenCode the variable that switches capture on names the worktree, so decisions land in the same `.agent-flow/` the plugin times. On Claude Code the git top-level is the project root from any subdirectory. When the two disagree, the appender refuses (`.agent-flow is missing`) and never writes elsewhere. |
| Who fills which field | The agent supplies `role`, `title`, `why`, `rejected`, `confidence`, and `kind`, which is always `decision`. The appender attaches `step` from the step in progress. The template stamps `at` with `date -u`, and that stamp comes after the agent's body. | The agent cannot know the time or be trusted to name the step. Under JSON's last-key-wins rule, a duplicate `at` in the agent's text loses to the template stamp. |
| Command/data separation | The agent's text enters only through a quoted heredoc, inside `"$( … )"`, ended by an unlikely sentinel (`AF_DECISION_EOF_7c1e5b9a`). The agent has two duties left: escape its values as JSON strings, and never write a line equal to the sentinel. | No shell expansion ever runs on the agent's text (A03). A common word as the sentinel would end the heredoc early. |
| Shell floor | The template is supported under POSIX `sh` and `bash` only, and the rule says so. | These are the shells the BDD runs it under. Other shells are unverified. |
| Role vocabulary | The table in the rule file is the single source of role ids. The schema keeps `role` open (`decisions-jsonl-schema`). | The ids are persisted in lines on disk and read by the panel. A rename breaks lines that are already written. |
| Mirror guard | The BDD resolves each shim the way its runtime would, and asserts both reach the same real file. It then runs the extracted template in a real shell. | A drift between the shims becomes a red build, not a review finding. |

### Considered and rejected

| Option | Why rejected |
|---|---|
| Two hand-written copies (CLAUDE.md + AGENTS.md) | Drift by construction |
| Inject the rule through a SessionStart / system-prompt hook or plugin | Production code in two adapters for what native instruction files already do |
| JSON in single quotes, or a double-quoted / unquoted heredoc | An apostrophe breaks single quotes. Unquoted forms execute `$(…)` in agent text |
| `DECISION` as the heredoc sentinel | A plausible line of prose ends the heredoc and runs the rest as shell |
| `$PWD` as the worktree | Wrong as soon as the agent works in a subdirectory |
| The appender fills `at` from its own clock | Changes the closed #35 surface. To be revisited if live runs show agents fumbling the template |
| The `AGENT_FLOW_HOME` check written in the launcher's shell | Outside every Stryker glob, so the decision would escape the mutation gate |
| A second copy of the predicate for the launcher | Two copies of a fail-closed rule drift, and one point would accept what the other refuses |
| Moving the shared predicate out of `rule-guard/` into a new shared module or `core/` | The launcher imports it from the sibling feature folder `rule-guard/` on purpose: one extra consumer, and a move pays nothing back. Revisit when a third consumer appears |

## Consequences / Constraints

- **MUST**: a new agent rule is one runtime-neutral file under `rules/`. Each runtime reaches it through its shim, never through a second copy.
- **MUST**: the shim paths `rules/claude-code/CLAUDE.md`, `rules/opencode/opencode.json` and `rules/opencode/agent-flow-opencode` stay stable. Installs point at them, so moving one breaks every install.
- **MUST**: the launcher and the rule guard decide on `AGENT_FLOW_HOME` through the same predicate.
- **MUST NOT**: a shim under `rules/` holds a decision. A check a shim needs is TypeScript under `capture/<runtime>/src`, inside the Stryker globs.
- **MUST**: the agent's text reaches a command only as quoted-heredoc data. The template's own fields (`at`) come after the agent body.
- **MUST NOT**: a rule tells an agent to set `step` or `at`, or to write any `.agent-flow/` file other than through the #35 command.
- **MUST NOT**: rename a role id once it has been written to `decisions.jsonl`.
- **Out of scope**: installing the shims into a real project (CLAUDE.md import line, OpenCode config merge, Bash allow rules, seeding `plan.json`), and `question`, `deviation` and `step_event` lines. These are #17 and later phases.

## Open questions / Gaps

- [ ] The #35 appender passes a caller-supplied `step` through unchanged (`capture/shared/src/decision-append/decision-append.ts:53`). The rule forbids setting `step`, but nothing enforces that. Waiting for the human's decision.
- [ ] A live check of the template under zsh and bash 3.2 has not been run. Recorded by the real-issue runs #80 and #81.
