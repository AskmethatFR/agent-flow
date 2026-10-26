---
id: "paseo-mobile"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-10-26"
links:
  - "paseo-api-version"
answers:
  - "Does the Agent Flow spike panel render on the Paseo mobile app?"
  - "What differences exist between the Paseo desktop and mobile rendering of the Agent Flow panel?"
  - "Which Paseo plugin APIs are unavailable on mobile for the Agent Flow panel?"
  - "What is the kill-criterion verdict for epic #1's 'desktop or mobile' hypothesis?"
decided_in:
  - "#31"
---

# Paseo mobile rendering

> **One-liner**: whether the #10 spike panel renders on the Paseo mobile app, every desktop/mobile
> difference found, and the kill-criterion verdict that gates epic #1's "desktop or mobile" leg.
> **Links**: [[paseo-api-version]] — the version, API and trust model this spike relies on. Scenario
> file: `features/phase-0/host-panel-mobile.feature` (S1).

## Context

Epic #1 Phase 0 frames the panel target as "desktop **or** mobile". #10 proved the desktop leg: the
client-only spike at `spikes/paseo/` registers one empty "Agent Flow" workspace panel and renders on
Paseo desktop. #31 is the spike that retires the mobile risk: re-install the *same* plugin and open
the same panel from the Paseo mobile app. It ships no production code — the deliverable is this
record plus a reused throwaway proof ([[paseo-api-version]]).

The spike's client entry was already mobile-safe before this run: `client/agent-flow-panel.tsx`
renders only React Native `View`/`Text`, reads colours from `theme.colors`, and pads from
`layout.compact` (`client/agent-flow-panel.tsx:6-7`).

## Differences found (AC2)

| # | Difference | Finding |
|---|---|---|
| 1 | Padding (`layout.compact`) | `layout.compact` is true on mobile → padding **16**; false on desktop → **24** (`client/agent-flow-panel.tsx:6`). The spike already adapts via `layout.compact ? 16 : 24`; no `Platform` branch is needed. |
| 2 | Command Center reachability | ⌘K / Ctrl+K ("Open Agent Flow") is a **desktop** affordance (`index.client.tsx:15-23`). The intended mobile route to the panel — the "Agent Flow" **workspace tab** itself (`addWorkspacePanel` → `openPanel("agent-flow")`, `index.client.tsx:8-14,21`) — does not exist on mobile: the mobile app has no workspace UI (see Verdict). |
| 3 | Workspace-tab layout on a small screen | **Unverified** — no mobile render was observed at all (the mobile app has no workspace UI), so small-screen layout has no evidence. The spike renders only a `View`/`Text` with theme colours (`layout.compact ? 16 : 24` padding), so nothing would need reflow if a host ever renders it. |
| 4 | APIs unavailable on mobile | **The panel contribution surface itself is unreachable on mobile** — `addWorkspacePanel` has no host there, so the spike's client code never mounts in the mobile app. Within the spike's surface no other API is affected: it uses only `View`/`Text`, `theme.colors`, and `layout.compact`. The audit of `client/` (`rg -n 'document\.|window\.|localStorage|navigator\.|<[a-z]+[ >]|className=|onClick=' client/`) returned zero hits (exit 1): no DOM globals, no `fetch`, no `PaseoApi` calls in `client/`. |
| 5 | Platform tested | Paseo **mobile app** via the relay (paired to the local daemon); app version reported the same as desktop — `0.13.0` (human report 2026-10-26). |
| 6 | Server entry (trust drift) | Post-#26, `spikes/paseo/` carries `index.server.ts` + `server/**` (commit `a1c0b87`); re-installing the spike runs a **daemon subprocess**, not just the client panel. `api-version.md:81` "Server entry: None in the spike" described #10 only and is now stale — corrected here, not edited there. |

## Verdict and kill-criterion evidence trigger

**Verdict: `belief fails` (human report 2026-10-26), resolved by the human's ruling: desktop-only panels.**
The Paseo mobile app (version reported the same as desktop, `0.13.0`) exposes **no workspace UI at
all**: the installed plugin appears only under Settings → Plugins. The workspace-tab contribution
surface (`addWorkspacePanel`, `index.client.tsx:8`) has **no host on mobile**, so the "Agent Flow"
panel cannot be opened there. The desktop leg stays confirmed (#10): the empty panel renders on
Paseo desktop `0.13.0` against daemon `0.11.4`.

Epic #1's kill criterion fired ("empty panel does not render on desktop or mobile after #10 and #31")
and the human ruled on the host: **panels target desktop; mobile stays a plugin-settings and
monitoring surface.** #42 will be re-scoped to desktop panels at its own refinement; panel stories
do not stop — they continue desktop-scoped.

The record states exactly one trigger, drawn from the tech spec (Architecture decision 5):

- `belief holds` — AC1 screenshot shows the empty panel on mobile → the mobile leg of epic #1's
  "desktop **or** mobile" is falsified, #42 unblocks. **Not taken.**
- `belief fails` — the panel does not render on mobile, with a stated cause → panel strategy goes to
  the human before #42 starts (desktop #10 stays confirmed). **Taken — resolved by the human ruling
  above.**
- `inconclusive` — the one-run timebox was spent without a verdict → the record states the blocker +
  one fallback (AC3); #42 stays on hold. **Not taken.**

**Failure branch (AC3) — the actual outcome, not counterfactual.** Cause: the mobile app offers no
workspace/panel host surface at all, so the `addWorkspacePanel` contribution has nowhere to mount.
Fallback options:

- **Desktop-only panel strategy** — the fallback the human chose (ruling above). Panels target the
  desktop app; mobile keeps only plugin settings/monitoring.
- **Relay-hosted desktop surface** — delivering the panel through the mobile browser against the
  relay-hosted desktop surface. Unvetted: it would widen the relay's exposure and needs a Security
  pass if ever used. Recorded, not chosen.

## Evidence

Run 2026-10-26, `spikes/paseo/` against the local daemon (daemon/CLI `0.11.4`, `@getpaseo/plugin` `0.11.4`).

| Step | Command / source | Result |
|---|---|---|
| Dev A — deps | `npm ci` (root) / `npm ci --ignore-scripts --no-audit --no-fund` (spike) | 291 / 314 packages; deprecation warnings only (`inflight`, `rimraf`, `glob`) — same as #10 |
| Dev A — typecheck | `npm run typecheck` in `spikes/paseo/` | exit 0 |
| Dev A — tests | `npm test` (`node:test`, `server/agent-state-hooks.test.ts`) | 8 tests, 8 pass, 0 fail |
| Dev A — mobile audit | `rg -n 'document\.|window\.|localStorage|navigator\.|<[a-z]+[ >]|className=|onClick=' client/` | zero hits (exit 1) |
| Daemon — install | `paseo plugin install <worktree>/spikes/paseo --json` | trust notice, then `"id":"agent-flow-spike"`, `"enabled":true`, `"status":"running"`, `installation.identity.kind:"directory"` |
| Daemon — status | `paseo plugin ls agent-flow-spike --json` | `"status": "running"` |
| Daemon — logs | `paseo plugin logs agent-flow-spike` | `20:29:47.256Z [paseo] Loading plugin`, `20:29:49.593Z [paseo] Plugin ready`, then live `agent.turn_ended` JSON lines (post-#26 server entry) |
| Mobile — render | human report 2026-10-26 (Paseo mobile app via relay) | **does not render** — no workspace UI in the mobile app; plugin visible only under Settings → Plugins → `belief fails` |
| Mobile — workspace UI | human report 2026-10-26 | none — no workspace/panel host surface; `addWorkspacePanel` has nothing to attach to |
| Mobile — screenshot | `docs/technical/paseo/evidence/mobile-empty-panel.png` | **n/a** — nothing to capture (no panel surface) |
| Mobile — app version | human report 2026-10-26 | reported the same as desktop (`0.13.0`) |

## Consequences / Constraints

The #10 MUST/MUST-NOT list is inherited unchanged — see [[paseo-api-version]] "Consequences /
Constraints" (`requirements.paseo >= 0.11.4`, `context` required, colours from `theme.colors`, no DOM
globals, no `PaseoApi` `terminals.*`/`agents.create`/`config.*`/`fetch`, reload not restart). It is not
restated here.

Corrected trust line (supersedes `api-version.md:81` for the post-#26 spike): the client code runs on
the human's devices through the relay and holds `PaseoApi` reach — `terminals.create`, `agents.create`,
`config.get`/`config.patch`, plus React Native `fetch` (`api-version.md:82`); the post-#26 server
entry's session is admitted as `owner` with all 9 daemon permissions — `daemon.read`, `daemon.manage`,
`tunnel.manage`, `access.manage` (pairing), `workspace.read`, `workspace.write`, `workspace.manage`,
`automation.manage`, `hub.execute` (`agent-state.md:85`) — and runs unsandboxed as the daemon user.

- **Cleanup**: the spike install is **live on the shared daemon now**, loaded from a mutable,
  uncommitted directory (this worktree); if that directory path is later reused for another branch,
  the daemon would load and run that unreviewed code. Clear it when the spike worktree is removed —
  the orchestrator runs `paseo plugin remove agent-flow-spike` (the #10 cleanup pattern), then
  verifies with `paseo plugin ls agent-flow-spike --json` that the plugin is gone. Tracked under
  Open questions.
- **Out of scope**: any data display, production code, raising `requirements.paseo`, the production
  plugin root `panel/` (#18/#42).

## Open questions / Gaps

- [ ] Cleanup tracking (Security S3): `paseo plugin remove agent-flow-spike` before the worktree is
      removed, then `paseo plugin ls agent-flow-spike --json` to confirm gone — orchestrator action.
- [ ] Deferred pointer: `api-version.md` should cross-link [[paseo-mobile]]; its stale "Server entry:
      None in the spike" (`api-version.md:81`) stays in the graph (twice-ruled supersession) and this
      record now carries the corrected trust line. Adding the pointer is outside #31's Touches —
      recorded here.
