---
id: "follow-issue-run"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-11-09"
relations:
  depends-on: ["real-issue-run", "paseo-agent-state", "snapshot-agent-status-read", "panel-agent-state", "paseo-api-version"]
answers:
  - "How is a real issue set up and launched so it can be followed from the Agent Flow panel alone, without a terminal?"
  - "How does QA judge each of the four facts of the Phase 2 exit scenario: current step, time, every decision, agent state?"
  - "Where does the evidence of a follow-issue run live, and what may be committed?"
  - "Which gaps can the run expose, and which slice owns each?"
decided_in:
  - "#22"
---

# Follow-issue run: Paseo launch, per-fact verdicts, evidence

> **One-liner**: The runbook for the manual Phase 2 exit scenario (`features/phase-2/follow-issue.feature` S1): how a real issue is set up and launched as a Paseo agent in the item worktree, what the operator records while watching the panel, and how QA reaches a verdict on each fact.
> **Links**: [[real-issue-run]] (capture setup and evidence rules, linked never copied), [[paseo-agent-state]] (worktree key, launch rule), [[snapshot-agent-status-read]] (how the agent line is read), [[panel-agent-state]] (what the panel renders), [[paseo-api-version]] (plugin install and panel entry).

## Context

S1 is tagged `@manual` (the runner skips it, `cucumber.js:15-16`): no BDD driver can make real agents work a real issue while a human watches a real Paseo app. All four facts already render (`panel/client/plan-rail.tsx:28-37`, `:39-41`, `panel/client/step-detail.tsx:10-24`); this run verifies them live and records what is missing. No production change is part of it.

The Phase 1 runs cannot stand in: both were headless `claude -p` from a terminal (`docs/technical/capture/evidence/real-issue-run/claude-code-rerun/run-setup.txt:1-2`), so no Paseo agent sat in the item worktree and no agent line would show (`daemon/src/snapshot/agent-status.ts:29-42`).

Roles: the **operator** is the human at the Paseo desktop app for the whole run (it takes about 50 minutes, as the #40 re-run did, `run-setup.txt:6`); **QA** judges the evidence afterwards; the **orchestrator** files the defects (section 7).

## 1. Setup (a terminal is allowed, and recorded)

Everything runs in the target project. `AGENT_FLOW_HOME` is an Agent Flow checkout at a recorded commit with `npm ci` done. Runtime: Claude Code only (OpenCode waits for #81).

| Concern | Action | Kept |
|---|---|---|
| Versions | `claude --version`, `node --version`, the Paseo daemon and CLI version, the Paseo desktop app version (Settings), the Agent Flow commit | the outputs |
| Issue | any open agent-flow issue triaged `fix-bug` or `new-feature` (parallel review lanes exercise the current-step rule) | the issue number |
| Panel install | `paseo plugin install "<AGENT_FLOW_HOME>/panel" --json` | output; expect `"status": "running"` (as `api-version.md:126`); else a G10 candidate, stop |
| Paseo workspace | a workspace whose `cwd` is the item worktree (`<wt>`) | the workspace name |
| Capture settings (B5) | `<wt>/.claude/settings.local.json`, see below | the file, minus anything secret |
| Rule shim | `CLAUDE.local.md` holding `@<AGENT_FLOW_HOME>/rules/claude-code/CLAUDE.md`, excluded locally (`real-issue-run.md:109`) | the line |
| First plan | seeded before the launch: `node "$AGENT_FLOW_HOME/capture/shared/bin/agent-flow-plan.mjs" <wt> <issue> "<title>"` (#78; `real-issue-run.md:37`) | command and exit code |

`<wt>/.claude/settings.local.json` replaces the `--settings` and `export` flags of [[real-issue-run]] `:33-35`, because the agent is launched from the Paseo app, which passes none:

| Key | Content |
|---|---|
| `hooks` | the `hooks` block of `capture/claude-code/settings.json:2-15`, verbatim (the `PostToolUse` hook on `TaskCreate\|TaskUpdate`) |
| `env` | `AGENT_FLOW_HOME=<abs>` and `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` |
| `permissions.allow` | `TaskCreate`, `TaskUpdate`, and the decision-command Bash rule matching `node *agent-flow-decision.mjs*` (`real-issue-run.md:35`; record the exact rule) |

The worktree's `.agent-flow/` is touched by nothing but the seeding step, the hook and the decision command; the no-human-edit protocol of [[real-issue-run]] is not repeated here (out of scope).

## 2. Launch (no terminal from here on)

| Rule | Detail |
|---|---|
| Launch convention (B4) | the item's agent is launched from the Paseo app, inside the Paseo workspace whose `cwd` is `<wt>`. The panel is opened in the same workspace. An agent launched by another agent elsewhere inherits its caller's workspace and maps to no item (`agent-state.md:111-120`), so that launch is excluded |
| Prompt | adapted from `run-setup.txt:8-17`: keep the issue sentence, the plan-with-task-tools sentence, the "log decisions with the decision command" sentence, the pull-request sentence and the `.agent-flow/` prohibition; drop the headless parts (the `-p` form, `--output-format`, the "no human is available" sentence, since the operator is present). Record the prompt as sent |
| Open the panel | Ctrl+K, "Open Agent Flow" (`api-version.md:129`) |
| Follow window | starts at the launch in the Paseo app; ends when the last step of `plan.json` is `done` |
| Precondition | the first plan step appears on the rail within 5 minutes of the agent's first plan. Otherwise it is a setup defect: stop, file it, and the run does not count |

## 3. Observation

The operator keeps a **checkpoint** at each of these moments: every move of `Current` to another step; at least every 10 minutes; and once per step, pressing that step after it is done to open its decisions. A checkpoint is a screenshot of the panel plus the UTC time, noted from a wall clock (no terminal is open).

One line per checkpoint in `observations.md`:

`time | current step | time label | agent line | Paseo agent status`

| Column | Source |
|---|---|
| time | UTC, to the minute |
| current step | the row carrying `Current` (`plan-rail.tsx:31`), or `none` |
| time label | the label under that row (`plan-rail.tsx:28-30`), as shown |
| agent line | the two lines after `Current`: `Agent: <role>` and the state (`plan-rail.tsx:32-37`), or `none` |
| Paseo agent status | the status of the launched agent in the Paseo app at the same moment |

Every checkpoint must be judgeable from its screenshot alone: the rail, the `Current` marker, the label and the agent lines are visible in it.

## 4. Verdict rules

QA reads `observations.md` and the screenshots against copies of the final `plan.json` and `decisions.jsonl` (section 5).

| Fact | Pass when | Fail when |
|---|---|---|
| **AC2 current step and its time** | at checkpoint time t, `Current` marks the in-progress step that started last (derived from `startedAt` and `endedAt`; first in plan order on a tie, `docs/functional/glossary.md:55`), and its label equals the label `core/src/snapshot/time-spent.ts:20-27` gives to t minus `startedAt`, within plus or minus 1 minute | `Current` marks another step, or the label differs by more than 1 minute, or there is no marker while a step is in progress at t. No marker is right only when no step is in progress at t |
| **AC3 every decision of every step** | the detail of each step lists, in file order, every `decisions.jsonl` line carrying the step id, each with title, why, role and confidence. "No decision logged for this step." appears only for a step with no line. `Decisions not shown: N` appears only for a step with more than 50 lines (`core/src/snapshot/snapshot.ts:11`, `:162-165`), and N is the excess | a line is missing, repeated or out of order, the empty text shows for a step that has a line, or the marker shows at 50 or fewer |
| **AC4 agent state on the current step** | at every checkpoint with `Current`, the next lines are `Agent: <that step's role>` and one of `running`, `stopped`, `unknown`, matching the Paseo app status (`running` for a running agent, `stopped` for idle or error, `unknown` otherwise, glossary `display state`) | a `Current` without an agent line is a fail, whatever the cause; also a wrong role or a state that contradicts the Paseo app |
| **AC1 panel only** | the operator signs: "I did not open a terminal between launch and the last step done", and every checkpoint is judgeable from its screenshot alone | the line is absent or false, or a checkpoint needs information from outside its screenshot |

A fail is a candidate gap (section 6); QA says which row it matches, or adds a new one.

## 5. Evidence

| Rule | Detail |
|---|---|
| Location | `docs/technical/paseo/evidence/follow-issue-run/` |
| Kept | `observations.md`, the screenshots, the setup record (versions, commands, settings file, prompt as sent), the attestation line, copies of the final `plan.json` and `decisions.jsonl` |
| Before any copy | scan every kept text file for secrets and home paths (patterns: `spikes/capture/shared/secrets.mjs:1-19`, as `real-issue-run.md:93-94`); the operator reviews every screenshot by eye for home paths, tokens and other secrets |
| On a hit | commit hashes only, never the file or the image |
| Who commits | the operator hands the folder over; the orchestrator commits it after QA's verdict |

## 6. Gap candidates

The run may confirm these. Anything else QA finds is added to section 7.

| # | Gap | Anchor | Owner if confirmed |
|---|---|---|---|
| G1 | No agent line when the agent is not a Paseo agent in the item worktree | `daemon/src/snapshot/agent-status.ts:29-42`; `agent-state.md:111-120` | #41 |
| G2 | The live read of `project.checkout.worktreeRoot` from `agents.list` has never been exercised | `snapshot-agent-status-read.md:30`, `:91`; `agent-state.md:175` | #41 |
| G3 | No `Current` while nothing is in progress (6 min 12 s and 3 min 25 s windows in the #40 re-run) | `core/src/snapshot/snapshot.ts:76-88`; `glossary.md:55`; `claude-code-rerun/plan.json:30-65` | by design; QA records it |
| G4 | Parallel lanes: only the latest-started lane is `Current` and carries the agent line | `core/src/snapshot/snapshot.ts:76-88`; `plan-rail.tsx:31-37` | by design; QA records it |
| G5 | Rework steps are listed after later steps | `claude-code-rerun/plan.json:68-85`; `plan-rail.tsx:24` | #19 if judged unreadable |
| G6 | Raw status text such as `(in_progress)` on each row | `plan-rail.tsx:27` | #19 if judged |
| G7 | More than 50 decisions in a step cannot all be read | `core/src/snapshot/snapshot.ts:11`, `:162-165` | #101 if hit |
| G8 | Orphan or transient decisions show only as error lines | `core/src/snapshot/snapshot.ts:157-160`; `snapshot-decisions.md:90` | #39 if persistent |
| G9 | The 100-agent page can miss the agent | `daemon/src/snapshot/agent-status.ts:20`; `snapshot-agent-status-read.md:63` | #41 if hit |
| G10 | The panel fails to install or load live | `snapshot-rpc.md:76-82` | #42 / #18 |

## 7. Results

| Date | Issue followed | Agent Flow commit | Versions | AC1 | AC2 | AC3 | AC4 | Gaps confirmed (defect filed) |
|---|---|---|---|---|---|---|---|---|

## Consequences / Constraints

- **MUST**: a follow-issue run follows sections 1 to 5 as written; a deviation is recorded in the results row, never absorbed silently.
- **MUST**: launch the agent from the Paseo app in the workspace on the item worktree (B4); the operator opens no terminal between the launch and the last step done.
- **MUST**: file every confirmed gap as a defect against its owning slice before #22 closes (AC5).
- **MUST**: the screenshots and every copied file stay out of the repository until scanned and reviewed.
- **MUST NOT**: judge a fact from anything but the checkpoint's screenshot, `observations.md` and the final file copies.
- **MUST NOT**: fix a gap inside #22; each one becomes its own defect.
- **Out of scope**: any change to `core`, `daemon`, `panel` or `capture` code; an automated replay of the run; launch automation; the OpenCode run (#81); the no-human-edit protocol of [[real-issue-run]]; the glossary and feature catalog (PM).

## Open questions / Gaps

- [ ] Section 7 is filled by the Architect (Documentation Mode) once QA has judged the run.
