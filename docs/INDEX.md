# Project Documentation Graph — INDEX

## T1

| ID | Title | Status | Updated | Links | Path |
|---|---|---|---|---|---|
| `plan-writer-confinement` | Plan writer: confinement chain, atomic replace, reader contract | current | 2026-10-31 | [[host-adapter-boundary]], [[workspace-layout-core-boundary]], [[capture-events]], [[snapshot-contract]] | `docs/technical/decisions/plan-writer-confinement.md` |
| `request-scope-contracts` | Frozen requests/responses/scope contracts: id bound, glob dialect, path rules | current | 2026-11-02 | [[decisions-jsonl-schema]], [[scope-origin]], [[paseo-messaging]], [[host-adapter-boundary]], [[workspace-layout-core-boundary]] | `docs/technical/decisions/request-scope-contracts.md` |
| `snapshot-agent-state` | Snapshot agent state: raw status in, display state and current agent out | current | 2026-11-07 | [[snapshot-contract]], [[host-adapter-boundary]], [[paseo-agent-state]], [[snapshot-rpc]], [[snapshot-decisions]] | `docs/technical/decisions/snapshot-agent-state.md` |
| `snapshot-contract` | Core snapshot contract: shape, failure codes, instant rule | current | 2026-11-02 | [[host-adapter-boundary]], [[workspace-layout-core-boundary]], [[decisions-jsonl-schema]], [[feature-catalog]] | `docs/technical/decisions/snapshot-contract.md` |
| `snapshot-decisions` | Snapshot decisions: per-step grouping, orphans, decisions-file failures | current | 2026-11-02 | [[snapshot-contract]], [[decisions-jsonl-schema]], [[snapshot-rpc]], [[host-adapter-boundary]], [[glossary]] | `docs/technical/decisions/snapshot-decisions.md` |
| `snapshot-rpc` | Snapshot RPC: workspaceId addressing, wire, reader chain, packaging | current | 2026-11-02 | [[host-adapter-boundary]], [[snapshot-contract]], [[paseo-api-version]], [[plan-writer-confinement]], [[workspace-layout-core-boundary]], [[paseo-agent-state]] | `docs/technical/decisions/snapshot-rpc.md` |

- `features/phase-0/plan-contract.feature` — #23 Frozen contract: plan.json accepts a valid sample, rejects an unknown step status (S1, S2)
- `features/phase-0/decisions-contract.feature` — #32 Frozen contract: decisions.jsonl accepts a valid sample, reports a malformed line by number (S1, S2)
- `features/phase-0/request-contracts.feature` — #24 Frozen contracts: requests.jsonl, responses.jsonl, scope.json accept a valid sample, reject a malformed line or field (S1, S2, S3)
- `features/phase-1/plan-writer.feature` — #34 Plan writer confined to .agent-flow: writes the updated plan, refuses outside targets, invalid plans and a missing plan.json (S1-S5)

## T2

| ID | Title | Status | Updated | Links | Path |
|---|---|---|---|---|---|
| `agent-rules` | Agent rules: runtime-neutral source, per-runtime shims, decision command | current | 2026-11-08 | [[decisions-jsonl-schema]], [[capture-events]], [[host-adapter-boundary]], [[snapshot-decisions]], [[workspace-layout-core-boundary]] | `docs/technical/capture/agent-rules.md` |
| `capture-events` | Runtime events for step started/done (Claude Code, OpenCode v2) | current | 2026-10-26 | — | `docs/technical/capture/events.md` |
| `loop-threshold` | Loop threshold (plan.md Q6) | current | 2026-10-26 | `capture-events` | `docs/technical/decisions/loop-threshold.md` |
| `real-issue-run` | Real-issue capture run: setup, AC4 evidence, QA procedure | current | 2026-11-05 | [[capture-events]], [[agent-rules]], [[plan-writer-confinement]] | `docs/technical/capture/real-issue-run.md` |
| `scope-origin` | Origin of scope.json (plan.md Q5) | current | 2026-10-26 | `capture-events` | `docs/technical/decisions/scope-origin.md` |

- `features/phase-1/contract-check.feature` — #17 Contract check: every file under .agent-flow reported checked, violation reported with file and line, unsafe layout refused (S1-S3)
- `features/phase-1/real-issue-capture.feature` — #17 Real-issue capture, run by hand per runtime (`@manual`): a real issue produces correct .agent-flow files (S1)

## T3

| ID | Title | Status | Updated | Links | Path |
|---|---|---|---|---|---|
| `paseo-api-version` | Paseo version, plugin API, permission model, plugin root/entries (#18, #42) | current | 2026-11-02 | — | `docs/technical/paseo/api-version.md` |
| `paseo-agent-state` | Reading agent state through the Paseo SDK: calls, statuses, permissions, agent identification (#26) | current | 2026-10-27 | `paseo-api-version`, `capture-events` | `docs/technical/paseo/agent-state.md` |
| `paseo-messaging` | Messaging an agent via the Paseo SDK, how a blocked agent waits (#27) | current | 2026-10-27 | `paseo-api-version`, `paseo-agent-state`, `host-adapter-boundary` | `docs/technical/paseo/messaging.md` |
| `paseo-mobile` | Paseo mobile render: desktop/mobile differences, kill-criterion verdict (#31) | current | 2026-10-26 | `paseo-api-version`, `paseo-agent-state` | `docs/technical/paseo/mobile.md` |

- `features/phase-0/host-panel-desktop.feature` — #10 Paseo host spike: empty panel renders on desktop (S1)
- `features/phase-0/host-agent-state.feature` — #26 Paseo host spike: daemon reads a running agent's state (S1)
- `features/phase-0/host-agent-message.feature` — #27 Paseo host spike: daemon delivers a message to a running agent (S1)
- `features/phase-0/host-panel-mobile.feature` — #31 Paseo host spike: empty panel renders on mobile (S1)

## T4

| ID | Title | Status | Updated | Links | Path |
|---|---|---|---|---|---|
| `ci-pull-request-posture` | CI posture on pull requests (`ci`, `bdd`) | current | 2026-10-26 | [[workspace-layout-core-boundary]] | `docs/technical/decisions/ci-pull-request-posture.md` |
| `host-adapter-boundary` | Host-adapter boundary between core and each host (plan.md Q7) | current | 2026-11-02 | [[workspace-layout-core-boundary]], [[paseo-api-version]], [[paseo-agent-state]], [[paseo-messaging]], [[capture-events]], [[scope-origin]] | `docs/technical/decisions/host-adapter-boundary.md` |
| `workspace-layout-core-boundary` | Workspace layout and the core import boundary | current | 2026-11-02 | [[capture-events]] | `docs/technical/decisions/workspace-layout-core-boundary.md` |

## T5

| ID | Title | Status | Updated | Links | Path |
|---|---|---|---|---|---|
| `decisions-jsonl-schema` | Frozen versioned decisions.jsonl schema: fields, enums, line framing, error shape | current | 2026-10-27 | [[workspace-layout-core-boundary]], [[host-adapter-boundary]], [[decisions-serializer-semantics]] | `docs/technical/decisions/decisions-jsonl-schema.md` |
| `decisions-serializer-semantics` | Serializer emitted-bytes semantics: read-back validated, never throws, one line | current | 2026-10-27 | [[decisions-jsonl-schema]], [[host-adapter-boundary]] | `docs/technical/decisions/decisions-serializer-semantics.md` |

## Functional nodes (owner: pm)

| ID | Title | Status | Updated | Links | Path |
|---|---|---|---|---|---|
| `feature-catalog` | Capabilities: contracts, snapshot, decisions, plan writer, contract check, agent display state | current | 2026-11-07 | `glossary`, `real-issue-run` | `docs/functional/features.md` |
| `glossary` | Ubiquitous language: decision, snapshot, time spent, plan writer, contract check, current agent | current | 2026-11-07 | `feature-catalog` | `docs/functional/glossary.md` |

- `features/phase-0/plan-contract.feature` — #23 Frozen data contracts: plan.json schema (S1, S2)
- `features/phase-0/decisions-contract.feature` — #32 Frozen data contracts: decisions.jsonl schema and reader (S1, S2)
- `features/phase-1/plan-writer.feature` — #34 Plan writer: step start/finish written to .agent-flow/plan.json, outside targets refused (S1-S5)
- `features/phase-1/step-lifecycle.feature` — #33 Step lifecycle: a step goes todo, in progress, done; several can be in progress; a done step restarted is reworked as a new step; bad transitions refused (S1-S2, S4-S7, S9-S13)
- `features/phase-1/decision-append.feature` — #35 Decision append: a decision is added to decisions.jsonl under the step in progress of its role, invalid ones and outside targets refused (S1-S11)
- `features/phase-1/step-timing-claude-code.feature` — #14 Step timing captured automatically in Claude Code, parallel steps timed on their own, rework timed as its own step (S1, S3, S4)
- `features/phase-1/step-timing-opencode.feature` — #15 Step timing captured automatically in OpenCode, parallel steps timed on their own, rework timed as its own step (S1, S3, S4)
- `features/phase-1/decision-logging.feature` — #16 Decision logging: every role logs its decisions with step, role, title, why and confidence; roles in parallel each log under their own step; a reviewing role logs its verdict with its reason; OpenCode launcher checks AGENT_FLOW_HOME (S1-S9)
- `features/phase-1/plan-seeding.feature` — #78 Plan seeding: plan.json seeded by the operator, steps added as the agent creates them, both runtimes (S1-S5)
- `features/phase-2/snapshot-steps.feature` — #38 Core snapshot: steps with time spent and current step (S1-S5)
- `features/phase-2/snapshot-decisions.feature` — #39 Core snapshot: decisions grouped by step, malformed line reported (S1-S3)
- `features/phase-2/agent-state-mapping.feature` — #40 Display state of the agent on the current step: running, stopped, unknown, no current agent (S1-S4)
- `features/phase-2/agent-state-rpc.feature` — #41 Agent state in the snapshot: running, host failure keeps the rest, stopped, other worktree ignored (S1-S4)
- `features/phase-2/time-spent.feature` — #19 Plan rail: time spent per step and the current step marked (S1-S3)
