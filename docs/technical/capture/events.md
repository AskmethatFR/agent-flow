---
id: "capture-events"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-10-26"
links: []
answers:
  - "What is the OpenCode v2 equivalent of Claude Code hooks for capturing plan updates? (plan.md Q3)"
  - "Which runtime event marks a plan step started, and which marks it done, in Claude Code and OpenCode v2?"
  - "Where does the initial list of plan steps come from, and which payload fields give step id, title and role?"
decided_in:
  - "#12"
---

# Runtime events for step started / step done

> **One-liner**: Evidence-backed map of the Claude Code 2.1.310 and OpenCode 2.1.4 events usable to capture "step started" and "step done", with payload fields, preconditions, and what is shared versus runtime-specific.
> **Links**: none yet. Consumers: tickets #14 (Claude Code capture) and #15 (OpenCode capture).

## Context

A "step" is a plan-list item the agent marks in progress and then done (`docs/plan.md` Phase 1: "When the agent marks the step as done"). Both runtimes expose such a list as a tool: Claude Code `TaskCreate` / `TaskUpdate`, OpenCode v2 `todowrite`. One headless, one-prompt proof per runtime (`spikes/capture/`) created two items, moved each `in_progress` then `completed`, and delegated item 1 to a subagent named `step-worker`. Every claim below cites a line of the committed, sanitized samples. `CC:n` = `spikes/capture/claude-code/samples/events.jsonl:n`, `OC:n` = `spikes/capture/opencode/samples/events.jsonl:n`. Anything not observed is labelled "not exercised" or "doc-sourced".

Run facts: Claude Code run on `haiku` (resolved `claude-haiku-5-5`, cost 0.37 USD under the 0.50 cap); OpenCode run on `anthropic/claude-haiku-5-5`. The OpenCode proof needed one re-run: the first run produced no plan-item event because the `todowrite` tool is not offered by default (see Preconditions). Offline check: `node spikes/capture/verify.mjs` passes its 7 per-runtime checks (including a single-run check and a path/token leak check) and 9 detector self-checks.

Provenance of the samples: both were produced by the delivery commit `f04e8a3` configuration (OpenCode: no env gate on the plugin, `permission` denying only `bash`, `edit`, `webfetch`, `--auto`). The configuration was hardened afterwards (env-gated plugin, deny-by-default permissions, deny-all `step-worker`); the hardened configuration was validated with `opencode debug config` and the `run.sh precheck` gate check but was NOT re-run against a model (no new model call was allowed). After capture, `spikes/capture/shared/finalize-samples.mjs` trimmed the records (11 at review time, 36 at the final trim, still growing) appended after the run's `location.shutdown` by a long-lived OpenCode background service still holding the pre-gate plugin (the sample keeps the 154 records up to the first `location.shutdown`; only the plan records, which carry the run's session ID, are provably the run's, and some shape-only bus records may come from the old service) and re-applied the extended sanitizer (dash-encoded home paths, `/tmp/claude-<uid>`).

## Decision / Specification

### 1. Mechanism per runtime (answers plan.md Q3)

| Runtime | Mechanism | Registration | Evidence |
|---|---|---|---|
| Claude Code | Command hooks (JSON on stdin) | `hooks` object in settings (`--settings`) | `CC:1-23` |
| OpenCode v2 | There are no hooks. Equivalent = plugin module `export default { id, async setup(ctx) }` using `ctx.tool.hook("execute.before" \| "execute.after", cb)` and the bus stream `ctx.event.subscribe()` | `.opencode/plugins/*.js` in the project, discovered at start (`--standalone` run) | `OC:30-31`, bus lines such as `OC:29`, `OC:52` |

### 2. Event to step meaning

| Meaning | Claude Code | OpenCode v2 |
|---|---|---|
| Plan list created | `PostToolUse` with `tool_name=TaskCreate` (once per item); dedicated `TaskCreated` hook carries `task_id`, `task_subject` | First `execute.after` of `todowrite` whose `input.todos` lists the items, all `pending` (`OC:31`); bus mirror `session.tool.called` (`OC:29`) |
| Step started | `PostToolUse` `tool_name=TaskUpdate` with `tool_input.status="in_progress"`; confirmed by `tool_response.statusChange {from:"pending", to:"in_progress"}` (`CC:7-8`, `CC:17-18`). No dedicated "started" hook | `execute.after` of `todowrite` where an item's `status` changed to `in_progress` versus the previous list (`OC:40-41`, `OC:125-126`) |
| Step done | `TaskCompleted` hook (`CC:15`, `CC:20`) or `PostToolUse` `TaskUpdate` `status="completed"` with `statusChange.to="completed"` (`CC:16`, `CC:21`) | `execute.after` of `todowrite` where an item's `status` changed to `completed` versus the previous list (`OC:115-116`, `OC:140-141`) |
| Role source | `SubagentStart` / `SubagentStop` (`agent_type`) (`CC:11`, `CC:13`); `PreToolUse`/`PostToolUse` `Agent` (`subagent_type`) (`CC:9-10`) | `execute.before/after` of `subagent` (`input.agent`) (`OC:51`, `OC:104`); bus `session.created` with `parentID`, `agent`, `title` (`OC:52`) |

### 3. Payload field paths

| Field | Claude Code | OpenCode v2 |
|---|---|---|
| step id | `task_id` (`TaskCreated`/`TaskCompleted`), `tool_response.task.id` (TaskCreate), `tool_input.taskId` (TaskUpdate): stable string `"1"`, `"2"` | absent. Items are `{content, status}` only; no id, no priority in this version. Use `content` (title) or list index as the key |
| title | `task_subject` / `tool_input.subject` | `content` |
| role | absent on plan-item events (updates came from the main thread: no `agent_id` / `agent_type` on `CC:7-8,14-21`) | absent on `todowrite` events |
| status | `tool_input.status` (`in_progress`, `completed`); `statusChange.{from,to}` in the response | `status` per item (`pending`, `in_progress`, `completed`); full list sent on every call |
| timestamp | none in the payload (`duration_ms` only); the recorder `at` is capture time | none in the hook event; recorder `at` is capture time. Unverified by a sample: the CLI `--format json` stdout stream showed a `timestamp` and `state.time.{start,end}` per tool call during the run, but that stdout was not committed |
| session | `session_id` | `sessionID` |
| parent / subagent link | `agent_id` on `SubagentStart/Stop`; `PostToolUse Agent` returns `agentId` (`CC:10`) matching it (`CC:11`) | child `session.created` payload `parentID` equals the calling session (`OC:52`) |

### 4. Initial plan source and preconditions

| Runtime | Initial list | Precondition |
|---|---|---|
| Claude Code | The first batch of `TaskCreate` calls before any `TaskUpdate to in_progress` (`CC:1-6`). Each creation is also a `TaskCreated` hook | Task tools are off by default on current models. The proof used `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` plus `--tools`/`--allowedTools` naming the task tools (doc-sourced as the cause: tools-reference; the run did not test without them). `TodoWrite` exists only with `CLAUDE_CODE_ENABLE_TASKS=0` (doc-sourced) |
| OpenCode v2 | The first `todowrite` call, whose `input.todos` is the whole list, all `pending` (`OC:31`) | The tool is not offered unless `experimental.todo` is `true` in `opencode.json` (observed: first run, the model answered it had no `todowrite` tool; the binary's config schema says "Enable the experimental todowrite tool. Defaults to false."). The plugin must be in a discovered location. `opencode run --standalone` loads it in a private server for that run; commands without `--standalone` (for example `opencode debug config`) can register the location in the shared background service |

### 5. Shared versus runtime-specific

| Shared logic (pure parts may go to `core/`; I/O stays in host adapters per `.claude/CLAUDE.md`) | Runtime-specific (belongs in the adapters #14 / #15) |
|---|---|
| Pure: state machine `todo -> in_progress -> done`; `startedAt` on first `in_progress`, `endedAt` on `completed` | Extraction. Claude: per-item deltas (`TaskUpdate {taskId, status}`) plus a dedicated `TaskCompleted` hook. OpenCode: the full list on every `todowrite`, so the adapter must diff successive lists keyed by `content` |
| Pure: sanitizer rules (`shared/secrets.mjs` token and path lists, string scrubbing); timestamp rule (recorder time unless the source gives one) | Wiring: Claude settings hooks running a command; OpenCode project plugin (JS, in-process) |
| Host adapter, shared by both: the append-only file writer (`shared/recorder.mjs` uses `node:fs`, so it is not `core/`; it worked unchanged for both runtimes) | Step id: native in Claude, synthesized in OpenCode. Status vocabulary maps `completed -> done` |
| Output contract (`plan.json`, `decisions.jsonl`) | Role extraction (below) |

### 6. Traps

| Trap | Detail |
|---|---|
| OpenCode inference steps are not plan steps | `session.step.started` / `session.step.ended` fire once per model turn (`OC:24`, `OC:34`, many more). The observed names in 2.1.4 are `session.step.*`; the harness plugin uses `session.next.step.*`. Neither is a plan step. Do not wire either |
| Claude `Stop` / `SubagentStop` are turn or agent ends | Not step ends (`CC:12`, `CC:13`) |
| Blocking hooks | `TaskCreated` and `TaskCompleted` can block on exit code 2 (doc-sourced). Production hooks must exit 0 and print nothing |
| Background subagent | `Agent` returned `async_launched` (`CC:10`), so `SubagentStop` (`CC:13`) arrived after the first turn's `Stop` and the `completed` update came under a new `prompt_id` (`CC:14`). Do not assume the subagent ends before the next update |
| OpenCode provider retry | `session.retry.scheduled` (`OC:133`) fires when a model request is retried after a provider error; the step restarts (`OC:132` then `OC:134`). It is not a plan event; an adapter must not count it as a step or a failure of the plan |
| OpenCode bus has no todo event | No event type matching `todo` appeared in the 154 kept records (every plan record carries the run's session ID; shape-only bus records such as `skill.updated` at `OC:136`, `OC:139`, `OC:146` and `OC:7-9` carry none and may come from the old service). Caveat: types ending in `.delta` are dropped by the plugin before that test, so a hypothetical delta todo event would not be visible; no `todo` named type was seen in any recorded record. The todo list is only visible through the `todowrite` tool lifecycle (`execute.before/after`, `session.tool.called`, `session.tool.success` `metadata.todos`). The undocumented-todo-event hypothesis is closed as absent for 2.1.4 |
| Project plugin outlives the run | A project plugin is also registered in the long-lived `opencode serve --service` process by any command run without `--standalone` in that folder. That process keeps the plugin in memory and keeps recording unrelated OpenCode traffic after the run: stray records kept being appended after `OC:154` (11 at review time, 36 at the final trim) and had to be trimmed. A capture plugin must be opt-in (inert unless an env var names its output file, as the spike plugin now is), must abort its event subscription on `location.shutdown`, and a restart of the service is needed to drop an old copy. Matters for #15 |
| Global config still loads | `--standalone` isolates the server process, not the user configuration: global OpenCode plugins, global MCP servers (their connection events are in the sample, for example `OC:6`, `OC:17`) and user CLAUDE.md files loaded during the proofs. With `--auto`, anything not denied is approved, so the spike config denies everything except `todowrite` and the subagent tool. Global plugins did not write into the repo |
| `opencode models` flake | Twice failed with "Location plugins did not finish activating", then succeeded with `--print-logs`. Treat plugin activation as slow, not as a fatal error |

### 7. Role verdict and effect on #14 / #15

| Item | Verdict |
|---|---|
| Hypothesis (1): role from `agent_type` / session agent on the plan-item event | Killed for both runtimes in this proof: updates came from the main thread, so no role field. Not exercised: a subagent that itself writes the list (then Claude `agent_type` and the OpenCode child session `agent` would exist; unproven) |
| Hypothesis (2): join with the subagent call open while the item is `in_progress` | Works as a heuristic in both samples: Claude `Agent` `subagent_type=step-worker` at `CC:9` lies between `in_progress` (`CC:8`) and `completed` (`CC:16`); OpenCode `subagent` `input.agent=step-worker` at `OC:51` lies between `OC:41` and `OC:116`. Fragile with parallel or background subagents |
| Rule-driven fallback (hypothesis 3) | Recommended as the primary role source: an agent rule that puts the role in the item title (`<role>: <title>`) or writes a `step_event` line to `decisions.jsonl` (`plan.md` `kind: step_event`). Join stays a best-effort enrichment |
| Kill criterion | Not triggered: both runtimes have usable events for created, started and done. Only role has a fallback |
| #14 (Claude Code) | Use `PostToolUse` on `TaskCreate|TaskUpdate` plus `TaskCompleted`. Needs the task-tool precondition. Hooks must be silent and exit 0 |
| #15 (OpenCode) | Use a plugin on `execute.after` for `todowrite`, diff successive lists, key by `content`. Needs `experimental.todo: true`. Child sessions via `session.created.parentID` for the role join |

## Consequences / Constraints

- **MUST**: gate production capture on the two preconditions in section 4 and surface a clear message when the task or todo tool is missing; the agent would otherwise silently produce no plan events.
- **MUST**: treat OpenCode `todowrite` as full-list snapshots (diff them); treat Claude events as deltas.
- **MUST NOT**: use `session.step.*` / `session.next.step.*` or `Stop` as step boundaries.
- **MUST NOT**: depend on a todo bus event in OpenCode 2.1.4; none exists.
- **MUST (security, #14 / #15)**: persist an allowlist of fields only (step id, title, status, role, timestamps, session id), never a whole hook or tool payload.
- **MUST NOT**: persist prompt, assistant message or tool output text (the spike truncates and token-scrubs it, which is a denylist and is not a production control).
- **MUST**: write only under `.agent-flow/` (the frozen T1 contract), never into a committed path.
- **MUST**: ship OpenCode capture as an opt-in plugin (inert unless enabled, abort the subscription on shutdown) and run commands that load it with `--standalone`.
- **MUST**: render step titles as untrusted text in any UI (they come from the model).
- **MUST**: run Claude hooks with no stdout and exit 0.
- **Out of scope**: the normalizer, `plan.json` writer, multi-worktree behavior, subagent-authored lists, cost of the tools being enabled by default on future model versions.

## Open questions / Gaps

- [ ] Does `TaskUpdate` accept an `owner` field that could carry the role? Not tested.
- [ ] Does a subagent writing its own list expose `agent_type` / session `agent` on the plan-item event? Not exercised.
- [ ] Is `experimental.todo` stable across OpenCode 2.x releases? Observed on 2.1.4 only.
- [ ] Claude Code behavior without `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` is doc-sourced, not run.
- [ ] `docs/plan.md` Q3 should link `[[capture-events]]` once merged (T4's file, not changed here).
