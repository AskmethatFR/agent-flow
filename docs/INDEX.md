# Project Documentation Graph — INDEX

## T1

| ID | Title | Status | Updated | Links | Path |
|---|---|---|---|---|---|
| `snapshot-contract` | Core snapshot contract: shape, failure codes, instant rule | current | 2026-10-28 | [[host-adapter-boundary]], [[workspace-layout-core-boundary]], [[decisions-jsonl-schema]], [[feature-catalog]] | `docs/technical/decisions/snapshot-contract.md` |

- `features/phase-0/plan-contract.feature` — #23 Frozen contract: plan.json accepts a valid sample, rejects an unknown step status (S1, S2)
- `features/phase-0/decisions-contract.feature` — #32 Frozen contract: decisions.jsonl accepts a valid sample, reports a malformed line by number (S1, S2)
- `features/phase-0/request-contracts.feature` — #24 Frozen contracts: requests.jsonl, responses.jsonl, scope.json accept a valid sample, reject a malformed line or field (S1, S2, S3)

## T2

| ID | Title | Status | Updated | Links | Path |
|---|---|---|---|---|---|
| `capture-events` | Runtime events for step started/done (Claude Code, OpenCode v2) | current | 2026-10-26 | — | `docs/technical/capture/events.md` |
| `loop-threshold` | Loop threshold (plan.md Q6) | current | 2026-10-26 | `capture-events` | `docs/technical/decisions/loop-threshold.md` |
| `scope-origin` | Origin of scope.json (plan.md Q5) | current | 2026-10-26 | `capture-events` | `docs/technical/decisions/scope-origin.md` |

## T3

| ID | Title | Status | Updated | Links | Path |
|---|---|---|---|---|---|
| `paseo-api-version` | Paseo version, plugin API, permission model, plugin root/entries (#18, #42) | current | 2026-10-26 | — | `docs/technical/paseo/api-version.md` |
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
| `host-adapter-boundary` | Host-adapter boundary between core and each host (plan.md Q7) | current | 2026-10-27 | [[workspace-layout-core-boundary]], [[paseo-api-version]], [[paseo-agent-state]], [[paseo-messaging]], [[capture-events]], [[scope-origin]] | `docs/technical/decisions/host-adapter-boundary.md` |
| `workspace-layout-core-boundary` | Workspace layout and the core import boundary | current | 2026-10-26 | [[capture-events]] | `docs/technical/decisions/workspace-layout-core-boundary.md` |

## T5

| ID | Title | Status | Updated | Links | Path |
|---|---|---|---|---|---|
| `decisions-jsonl-schema` | Frozen versioned decisions.jsonl schema: fields, enums, line framing, error shape | current | 2026-10-27 | [[workspace-layout-core-boundary]], [[host-adapter-boundary]], [[decisions-serializer-semantics]] | `docs/technical/decisions/decisions-jsonl-schema.md` |
| `decisions-serializer-semantics` | Serializer emitted-bytes semantics: read-back validated, never throws, one line | current | 2026-10-27 | [[decisions-jsonl-schema]], [[host-adapter-boundary]] | `docs/technical/decisions/decisions-serializer-semantics.md` |

## Functional nodes (owner: pm)

| ID | Title | Status | Updated | Links | Path |
|---|---|---|---|---|---|
| `feature-catalog` | Capabilities, frozen data contracts, plan snapshot | current | 2026-10-28 | `glossary` | `docs/functional/features.md` |
| `glossary` | Ubiquitous language: decision, snapshot, time spent | current | 2026-10-28 | `feature-catalog` | `docs/functional/glossary.md` |

- `features/phase-0/plan-contract.feature` — #23 Frozen data contracts: plan.json schema (S1, S2)
- `features/phase-0/decisions-contract.feature` — #32 Frozen data contracts: decisions.jsonl schema and reader (S1, S2)
- `features/phase-2/snapshot-steps.feature` — #38 Core snapshot: steps with time spent and current step (S1-S5)
