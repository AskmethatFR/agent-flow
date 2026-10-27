# Project Documentation Graph — INDEX

## T1

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
| `paseo-messaging` | Messaging an agent via the Paseo SDK, how a blocked agent waits (#27) | draft | 2026-10-27 | `paseo-api-version`, `paseo-agent-state`, `host-adapter-boundary` | `docs/technical/paseo/messaging.md` |
| `paseo-mobile` | Paseo mobile render: desktop/mobile differences, kill-criterion verdict (#31) | current | 2026-10-26 | `paseo-api-version`, `paseo-agent-state` | `docs/technical/paseo/mobile.md` |

- `features/phase-0/host-panel-desktop.feature` — #10 Paseo host spike: empty panel renders on desktop (S1)
- `features/phase-0/host-agent-state.feature` — #26 Paseo host spike: daemon reads a running agent's state (S1)
- `features/phase-0/host-agent-message.feature` — #27 Paseo host spike: daemon delivers a message to a running agent (S1)
- `features/phase-0/host-panel-mobile.feature` — #31 Paseo host spike: empty panel renders on mobile (S1)

## T4

| ID | Title | Status | Updated | Links | Path |
|---|---|---|---|---|---|
| `ci-pull-request-posture` | CI posture on pull requests (`ci`, `bdd`) | current | 2026-10-26 | [[workspace-layout-core-boundary]] | `docs/technical/decisions/ci-pull-request-posture.md` |
| `host-adapter-boundary` | Host-adapter boundary between core and each host (plan.md Q7) | current | 2026-10-26 | [[workspace-layout-core-boundary]], [[paseo-api-version]], [[paseo-agent-state]], [[capture-events]], [[scope-origin]] | `docs/technical/decisions/host-adapter-boundary.md` |
| `workspace-layout-core-boundary` | Workspace layout and the core import boundary | current | 2026-10-26 | [[capture-events]] | `docs/technical/decisions/workspace-layout-core-boundary.md` |
