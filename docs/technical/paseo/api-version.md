---
id: "paseo-api-version"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-10-26"
links: []
answers:
  - "Which Paseo version does the Agent Flow plugin target?"
  - "Which Paseo plugin APIs does the Agent Flow panel use?"
  - "Which permissions does the Agent Flow plugin manifest declare?"
  - "What is the Paseo plugin manifest file name and where do the client and server entry points live?"
decided_in:
  - "#10"
---

# Paseo API version and plugin layout

> **One-liner**: the Paseo version Agent Flow targets, the plugin APIs and trust model it relies on, and the file layout #18 and #42 must use.
> **Links**: none. Scenario file: `features/phase-0/host-panel-desktop.feature` (S1).

## Context

`docs/plan.md:43`, `docs/plan.md:123`, `docs/plan.md:204` and `.claude/CLAUDE.md:10` frame the
question as "v0.7 or v0.8 of the plugin API". Paseo has no separate plugin API version: a plugin
declares the Paseo releases it supports in `paseo-plugin.json` → `requirements.paseo`, an npm semver
range checked by the daemon and by the app that runs client contributions. 0.8 was the first
breaking plugin release (runtime-entry split into `index.client.*` / `index.server.*`); a manifest
without `requirements` is treated as `<0.8.0` and is rejected by 0.8+ hosts.

Spike #10 answers the question with a throwaway client-only plugin at `spikes/paseo/`
(runtime id `agent-flow-spike`) that registers one empty "Agent Flow" workspace panel.

## Q1 decision — targeted version

| Item | Value |
|---|---|
| Targeted range | `requirements.paseo: ">=0.11.4"`, no upper bound |
| SDK pinned for typecheck | `@getpaseo/plugin` `0.11.4` (devDependency) |
| Paseo CLI on the host | `0.11.4` (`paseo --version`) |
| Paseo daemon on the host | `0.11.4` (`paseo daemon status --json` → `daemonVersion`) |
| Paseo desktop app | pending — human reports the version from Settings |

| Option | Verdict | Why |
|---|---|---|
| `>=0.11.4` | **chosen** | The version the daemon and CLI actually run; `paseo plugin init` defaults to `>=<CLI version>`. The 0.11.4 typings are the contract the spike typechecks against. |
| `0.7` | rejected | Pre-split entry layout; a 0.8+ host refuses it. |
| `>=0.8.0` | rejected | Stale: the API moved after 0.8 (`addSurface`/`addSidebarItem` are now deprecated aliases of `addScreen`/`addSidebarHeaderItem`). 0.8-0.10 cannot be verified on this host. |
| `>=0.11.0` | rejected | Wider, but 0.11.0-0.11.3 are unverified here. |
| Upper bound (e.g. `<0.12.0`) | rejected for now | Added only once a later Paseo release is known to be incompatible. |

Raising the minimum is required whenever a later slice adopts an API newer than 0.11.4.

## APIs used

| API | From | Use in the spike |
|---|---|---|
| `contribute(client: PluginClientContext)` default export | `@getpaseo/plugin/client` | Client entry `index.client.tsx`; returns a cleanup |
| `client.addWorkspacePanel({ id, title, icon, context: "workspace", Component })` | `@getpaseo/plugin/client` | Registers panel `agent-flow`, title "Agent Flow", icon `PanelsTopLeft`; returns a remover |
| `client.addCommandCenterItem({ id, title, icon, context: "workspace", onSelect })` | `@getpaseo/plugin/client` | Command Center (Ctrl+K / Cmd+K) item "Open Agent Flow"; returns a remover |
| `onSelect({ openPanel })` → `openPanel("agent-flow")` | `PluginWorkspaceCommandContext` | Opens the panel as a workspace tab |
| `PluginWorkspacePanelProps.theme.colors.surface0` / `foregroundMuted` | `@getpaseo/plugin/client` | Root background and muted text colour |
| `PluginWorkspacePanelProps.layout.compact` | `@getpaseo/plugin/client` | Padding 16 (compact) / 24 |
| `View`, `Text` | `react-native` (host-supplied) | The only primitives rendered |

Typing facts found in `@getpaseo/plugin` 0.11.4 (`dist/client/contracts.d.ts`):

- `context` is a **required discriminant** on both `PluginWorkspacePanelContribution` and
  `PluginCommandCenterItemContribution` (`"workspace" | "agent"`, plus `"global"` for commands).
  Omitting it fails the typecheck; the prose reference that calls it deprecated does not match the 0.11.4 typings.
- `locations?: ("workspace" | "explorer")[]` is optional; omitted, the panel opens as a workspace tab.
- Every `add*` returns a `PluginCleanup` (`() => void | Promise<void>`).

## Permissions

| Aspect | Value |
|---|---|
| Manifest permission field | None: the manifest schema in the [Paseo plugin reference](https://paseo.sh/docs/plugins/reference.md) defines no permission field. The daemon's parser (`@getpaseo/server` 0.11.4, `dist/server/server/plugins/manifest.js:20-29`) is a non-strict `z.object` with `id`, `name`, `description`, `icon`, `media`, `requirements` and `build` only, so an unknown `permissions` key is silently stripped. Declaring one grants or restricts nothing |
| Manifest fields declared | `id`, `requirements` only (no `build`, `name`, `icon`, `media`) |
| Trust model | Plugins are trusted, unsandboxed code; trust is the daemon's global `pluginsEnabled` switch (already `true` on the local daemon) plus an explicit `paseo plugin install` |
| Server entry | None in the spike: no daemon subprocess runs plugin code |
| Client reach | Not limited by being client-only. Client code runs inside the Paseo app (desktop and, through the relay, mobile) and holds `paseo: PaseoApi` (`@getpaseo/plugin` `dist/client/contracts.d.ts:187`). That API includes `terminals.create`, which runs processes on the daemon host; `agents.create`, which starts a coding agent on the daemon host with a caller-chosen `cwd`, `env` and `prompt` (`@getpaseo/client` `dist/index.d.ts:164-183`); and `config.get` / `config.patch`, which read and change daemon config, including provider settings and environment (`@getpaseo/client` `dist/index.d.ts:370-398`). React Native also gives client code `fetch`. The spike uses none of these: it renders `View` and `Text` only, with no DOM globals (mobile audit empty) |
| Dependencies | devDependencies only, used for typechecking; the host supplies runtime modules |
| Install | `npm install --ignore-scripts`; `package-lock.json` committed for audit |

## AC4 — manifest name and entry points for #18 and #42

Ruled by the human (BQ1, 2026-10-26): the production plugin root is `panel/`.

| Path | Runtime | Owner | Rule |
|---|---|---|---|
| `panel/paseo-plugin.json` | — | #18 | Manifest file name is exactly `paseo-plugin.json`, at the plugin root |
| `panel/index.client.tsx` | App | #18 / #42 | Client entry; default-exports `contribute(client)` |
| `panel/client/**` | App | #42 | All UI code; imports no `server/` and no `node:` module |
| `panel/shared/**` | Both | #18 | RPC contracts and plain values only; no Node or React Native imports |
| `panel/index.server.ts` | Daemon subprocess | #18 | Server entry; registration only via `server.handle(contract, fn)` |
| `panel/server/**` | Daemon subprocess | #18 | Registration glue; each `fn` is imported from the `daemon` workspace package |

- No other code module may sit in the plugin root.
- `daemon` imports no `panel/*`.
- #9's placeholder `panel/src/index.tsx` becomes `panel/index.client.tsx`.
- #18's Touches gain `panel/index.server.ts`, `panel/server/**`, `panel/shared/**`.
- #42 builds under `panel/client/**`.

**Privilege warning for #18 (server entry).** `panel/index.server.ts` runs as a forked, unsandboxed
Node child process under the daemon's user and holds `PaseoApi`. Any connected client can call its
RPCs, and the runtime's `contract.input.parse` is the only server-side input check.

- **MUST**: define every RPC input as a schema in `panel/shared/**` and register it through
  `server.handle(contract, fn)`, so that each input is parsed before `fn` runs. No handler may accept unvalidated input.
- **MUST**: give each handler only the access its use case needs (least privilege). No general-purpose
  file, process or config access may be exposed through an RPC.
- **MUST**: install dependencies with `npm install --ignore-scripts`. Nothing enforces this today:
  there is no `.npmrc` with `ignore-scripts=true`, so it depends on whoever runs the install.

## Evidence

Run on 2026-10-26 in `spikes/paseo/` against the local daemon (daemon and CLI `0.11.4`).

| Step | Command | Result |
|---|---|---|
| Install deps | `npm install --ignore-scripts --no-audit --no-fund` | `added 314 packages`; deprecation warnings only (`inflight@1.0.6`, `rimraf@3.0.2`, `glob@7.2.3`); `package-lock.json` created |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | no output, exit 0; no extra devDependencies needed for the SDK peers |
| Mobile audit | `rg -n 'document\.\|window\.\|localStorage\|navigator\.\|<[a-z]+[ >]\|className=\|onClick=' client` | no hits (exit 1) |
| Dependency audit | `npm audit --omit=optional` | `found 0 vulnerabilities` |
| Install plugin | `paseo plugin install <worktree>/spikes/paseo --json` | trust notice printed, then `"id":"agent-flow-spike"`, `"enabled":true`, `"status":"running"`, `installation.identity.kind: "directory"` |
| Status | `paseo plugin ls agent-flow-spike --json` | `"status": "running"`, no error |
| Logs | `paseo plugin logs agent-flow-spike` | `11:08:51.738Z [paseo] Loading plugin`, `11:08:52.198Z [paseo] Plugin ready` |
| Desktop render | Ctrl+K → "Open Agent Flow" on Paseo desktop | rendered: empty panel, screenshot at docs/technical/paseo/evidence/desktop-empty-panel.png |
| Desktop app version | Settings on Paseo desktop | pending — human report |

The installation is a `directory` source pointing at `spikes/paseo/` in the ticket's uncommitted,
mutable worktree on the shared daemon. The loader picks up an entry by file name alone, so any
`index.server.ts` added to that directory would run on the daemon at the next load. The install must not
outlive the worktree (see Cleanup).

## Verdict

- **Daemon side: verified.** The client-only plugin installs, loads and reports `running` on Paseo 0.11.4,
  and its source typechecks against `@getpaseo/plugin` 0.11.4.
- **Desktop render: rendered (AC2).** The "Agent Flow" workspace tab shows the empty panel on Paseo desktop
  (screenshot at docs/technical/paseo/evidence/desktop-empty-panel.png). The desktop app version is still pending.

## Consequences / Constraints

- **MUST**: keep `requirements.paseo` at `>=0.11.4` or higher; raise it when adopting a newer API.
- **MUST**: pass `context` on every panel and Command Center contribution while the 0.11.x typings require it.
- **MUST**: colour every `Text` from `theme.colors` and pad from `layout.compact`.
- **MUST NOT**: add DOM globals, HTML elements, `className` or `onClick` to client code.
- **MUST NOT** (#42 and every later client slice): call `PaseoApi` `terminals.*`, `agents.create` or `config.*`, or use
  `fetch`, from `panel/client/**` unless a later ticket explicitly specifies that use.
- **MUST NOT**: restart the shared daemon to load plugin changes; use `paseo plugin reload <id>`.
- **Cleanup**: run `paseo plugin remove agent-flow-spike` once the AC2 evidence is captured and before the
  #10 worktree is removed. If #31 needs the spike, it re-installs it from the main checkout.
- **Out of scope**: mobile rendering (#31), agent state (#26), RPCs and the server entry (#18), data display (#42).

## Open questions / Gaps

- [ ] #18: whether Paseo's server bundle resolves a TypeScript-source workspace package (`daemon`, `core`) is unverified.
- [ ] The desktop app version on the human's machine (pending evidence).
