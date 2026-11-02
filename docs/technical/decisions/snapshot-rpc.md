---
id: "snapshot-rpc"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-11-02"
relations:
  depends-on: ["host-adapter-boundary", "snapshot-contract", "paseo-api-version"]
  related: ["plan-writer-confinement", "workspace-layout-core-boundary", "paseo-agent-state"]
answers:
  - "How does the panel name the worktree whose snapshot it wants, and how does the daemon resolve it with no path crossing the RPC?"
  - "What are the snapshot RPC's name, input and reply, and why is a refusal a value?"
  - "How does the daemon read .agent-flow/plan.json, and against which path tricks?"
  - "How do TypeScript-source workspace packages reach Paseo's server bundle, and why do the JSON Schemas live in core/schemas?"
  - "What does the snapshot reader deliberately not guarantee?"
decided_in:
  - "#18"
---

# Snapshot RPC: worktree addressing, wire, reader chain, packaging

> **One-liner**: The panel asks for a snapshot by Paseo `workspaceId` through the `get-snapshot` RPC. The daemon resolves that id to a worktree through a structural port, reads `.agent-flow/plan.json` through a no-follow, descriptor-checked, bounded chain, and returns core's snapshot or a refusal, both as values. Every file a TypeScript-source workspace package reaches by relative path stays inside that package, which is why the schemas live in `core/schemas/`.
> **Links**: [[host-adapter-boundary]] (`:127` closed codes, `:129` no path leaves the host, `:131` confinement, `:132` read bound; closes its gaps `:141`, `:142`), [[snapshot-contract]] (the transported `Snapshot`, additive-only), [[paseo-api-version]] (plugin layout `:90-99`, RPC input rule `:109-110`; closes `:159`), [[plan-writer-confinement]] (writer-side chain and reader contract `:58`), [[paseo-agent-state]] (`workspaceId` → `worktreeRoot`, `:161`, `:168`), [[workspace-layout-core-boundary]] (core import boundary, now with `outside-package`). Consumers: #42 (panel), #39, #40, #41.

## Context

#18 serves the first RPC: the panel must show one worktree's plan without computing it. Two questions were left open for this slice: how a client names a worktree when no path may leave the host (`host-adapter-boundary.md:141`), and whether Paseo's server bundle can load a TypeScript-source `core` (`host-adapter-boundary.md:142`, `api-version.md:159`).

Corrected here, not edited there (closed records):
- The #18 tech spec's architecture decision 3 claimed, from the compiler source alone, that linked-dependency admission settles bundling. A live load refuted that for a repo-root `schemas/` folder; see Packaging.
- `host-adapter-boundary.md:82` calls the RPC `getSnapshot`; the wire name is `get-snapshot`.
- `host-adapter-boundary.md:131` admits "a worktree named by a client" by real-path equality. On Paseo no client names a worktree: admission holds by construction (Addressing).
- `workspace-layout-core-boundary.md:38` counts four rule kinds and anchors `import-boundary.ts:16-47`. The scanner now has five (`core/test/import-boundary.ts:8-13`); `outside-package` is decided at `:40-44`.
- `api-version.md:113-114` says no `.npmrc` enforces `--ignore-scripts`; `.npmrc:1` now does.

## Decision / Specification

### Addressing

| Concern | Decision | Rationale |
|---|---|---|
| Handle | the panel names a worktree by its Paseo `workspaceId`; no path crosses the RPC | the panel already holds `workspaceId`; `host-adapter-boundary.md:129`, `agent-state.md:168` |
| Resolution | `workspaces.ref(id).refresh()` → `project.checkout.worktreeRoot`. The root must be an absolute string, then `realpath` (`daemon/src/snapshot/get-snapshot.ts:28-51`) | the host's own registry is the known set, so admission needs no client-side comparison |
| Port | structural `WorkspaceSource` (`get-snapshot.ts:14-16`); `panel/server/snapshot.ts:6` passes `context.paseo.workspaces`, and the typecheck proves it is assignable | `daemon` has no Paseo import (`daemon/src/snapshot/boundary.test.ts:13` allows only relative, `node:*`, `@agent-flow/core/{snapshot,contracts}`, `zod`); the Paseo coupling is one line; pattern from `agent-state.md:63` |
| Leakage | only `worktreeRoot` is read from the descriptor; no path, descriptor field or error text reaches the reply | `host-adapter-boundary.md:127`, `:129` |

### Wire (`panel/shared/snapshot-rpc.ts`)

| Concern | Decision | Rationale |
|---|---|---|
| Name | `get-snapshot` (`:29`) | the SDK requires `/^[a-z][a-z0-9._-]*$/` (`@getpaseo/plugin` 0.11.4 `dist/rpc.js:1`), which the issue's `getSnapshot` fails; the human ruled to keep `get-snapshot` |
| Input | `z.strictObject({ workspaceId })`, 1-256 chars (`:30`) | Paseo parses it before the handler runs (`api-version.md:109-110`); unknown keys are refused |
| Reply | `{kind:'snapshot', snapshot} \| {kind:'refused', reason:'unknown-worktree'}` (`:31-34`), returned and never thrown | a throw is an opaque rejection on the client and risks raw error text (`host-adapter-boundary.md:127`) |
| One refusal reason | a bad input, a null reading, no project, a null or relative root, an unresolvable root and a rejected `refresh()` all give `unknown-worktree` (`get-snapshot.ts:55-61`) | the panel shows the same thing for each; a distinct `host-error` is #41's |
| Snapshot schema | `SnapshotSchema` mirrors core's `Snapshot` field for field (`:4-26`); `panel/shared/snapshot-rpc.test.ts:36-39` pins type equality | a later additive field (#39, #40) fails the typecheck until the wire follows it (`snapshot-contract.md:38`) |
| Freshness | no push, no watcher, no cache: the panel polls, and every call re-reads the file (`get-snapshot.ts:62`) | the writer replaces by rename (`plan-writer-confinement.md:58`); push stays with #21 |
| Clock | `now` injected, bound to `new Date()` (`daemon/src/snapshot/index.ts:8`) | host clock (`host-adapter-boundary.md:85`) |

### Reader confinement chain (`daemon/src/snapshot/read-agent-flow-file.ts`)

| # | Step | Refuses | Anchor |
|---|---|---|---|
| 1 | `<realWorktree>/.agent-flow` must `lstat` as a directory, and its `realpath` must equal that path | a symlinked or non-directory `.agent-flow`, a linked ancestor | `:55` |
| 2 | open `O_RDONLY \| O_NOFOLLOW \| O_NONBLOCK` | a linked `plan.json` (ELOOP); a FIFO without hanging | `:33`, `:58` |
| 3 | `fstat` must be a regular file, and its dev/ino must equal `lstat(path)` dev/ino | a FIFO or directory; an entry swapped between open and lstat | `:59-64` |
| 4 | `readlink('/proc/self/fd/<fd>')` must equal the path. It is skipped **only** when `lstat('/proc/self/fd')` fails with ENOENT; any other probe error runs the re-check, which then fails closed | a descriptor reached through an `.agent-flow` swapped after step 1 | `:14-30`, `:65` |
| 5 | read at most `4 × MAX_TEXT_LENGTH + 1` bytes from the descriptor | oversize, including a file that grew after open | `:32`, `:35-44` |
| 6 | the descriptor is closed in `finally` | a leaked descriptor | `:72-77` |

| Outcome | Code |
|---|---|
| ENOENT on the directory or the file | `missing` (`:71`) |
| more than the cap | `too-large` (`:43`) |
| any other refusal or error | `unreadable` (`:56`, `:67`, `:71`) |

### Packaging (verified live on Paseo 0.11.4, 2026-11-02)

| Fact | Consequence | Evidence |
|---|---|---|
| Paseo compiles the server bundle from source with esbuild | no build step; TypeScript sources ship as-is | `@getpaseo/server` 0.11.4 `dist/server/server/plugins/compiler.js:311-321` |
| A TypeScript-source workspace package reached by bare specifier (`@agent-flow/daemon`, `@agent-flow/core`) is admitted as a linked root. The root is the nearest `package.json` whose `name` matches, and it must neither sit inside nor contain the plugin dir | `daemon` and `core` load as packages, never as plugin modules | `compiler.js:79-99`, `:149-153` |
| Every file such a package reaches by relative path must lie inside that same root; anything else is refused at load with "Plugin modules belong in client/, server/, or shared/" | the JSON Schemas live in `core/schemas/`; `core/test/import-boundary.ts:40-44` flags any relative import from `core/src` that resolves outside `core/` (rule `outside-package`) | `compiler.js:103`, `:146-147`; the install at `4c9d04d` failed with that error, and at `5430b69` it reports `running` and "Plugin ready" |
| Installs run without lifecycle scripts; workspace links are `file:` paths | `.npmrc:1` (`ignore-scripts=true`); `daemon/package.json:10`, `panel/package.json:7-8` | — |

### Stated residuals

| Residual | Why accepted | Owner |
|---|---|---|
| (a) On a host where `lstat('/proc/self/fd')` fails with ENOENT (e.g. macOS), only step 3 (regular file + dev/ino) guards the descriptor. A same-uid racer that can already write the worktree can swap `.agent-flow` and leave. An optional post-open `realpathSync(dir) === dir` re-check would narrow the window; it is not done | accepted by the human on 2026-11-02, as on the writer side (`plan-writer-confinement.md:65`) | none |
| (b) A writer's rename that lands between the reader's lstat and its readlink yields a one-off `unreadable` for a valid write; the next poll succeeds. This qualifies `plan-writer-confinement.md:58`: a reader sees the old or the new whole file, **or** one transient `unreadable` | polling absorbs it; a retry would widen the race analysis | none |
| (c) `decisions.jsonl` is not read | core ignores it until #39 (`snapshot-contract.md:41`) | #39 |
| (d) No distinct `host-error` refusal reason | no hypothesis here tells "host down" from "unknown"; additive enum member later | #41 |
| (e) The reader uses synchronous `node:fs` calls inside the long-lived Paseo daemon; a hung FUSE or NFS worktree can block the event loop. `O_NONBLOCK` does not cover regular-file reads | the same-uid actor able to mount one can already kill the daemon; an `fs/promises` port keeps the descriptor checks but rewrites the reader and its io double. Proposed by the Developer, awaiting human acknowledgement | none |
| (f) The input schema (`workspaceId`, 1..256) is written twice: in `daemon/src/snapshot/get-snapshot.ts` and in `panel/shared/snapshot-rpc.ts` | `panel/shared` is bundled for the client and must not import the daemon (`node:fs`); each side tests the same bounds | none |

### Considered and rejected

| Option | Why rejected |
|---|---|
| Client-supplied worktree path, checked against the known set | a path leaves the UI (`host-adapter-boundary.md:129`); the panel holds only `workspaceId` |
| RPC name `getSnapshot` | refused by the SDK's name pattern |
| JSON Schemas at the repo-root `schemas/` (tech spec decision 3) | refused at load: a relative import leaves core's linked root |
| Reusing `capture/shared` confinement | not exported, returns `ValidationResult` rather than a snapshot input, and couples the host to the capture family |
| Throwing on refusal | opaque client rejection; raw-text risk |
| `z.custom<Snapshot>()` reply schema | no runtime shape check; silent drift |
| `@getpaseo/*` types in `daemon` | binds the reusable host package to Paseo |
| Watcher, push, or an mtime cache | out of scope (#21); one bounded read per poll is cheap |

## Consequences / Constraints

- **MUST**: every plugin RPC that targets a worktree names it by `workspaceId`; resolution stays in the daemon.
- **MUST NOT**: import a Paseo package from `daemon`; the Paseo coupling stays in `panel/server`.
- **MUST**: a reply change is additive (a new `kind` or `reason` member); a removed or re-typed member is a new node superseding this one.
- **MUST**: `SnapshotSchema` follows every additive `Snapshot` field in the same change.
- **MUST NOT**: throw from a handler, or put a path, an error text or a descriptor field in a reply.
- **MUST**: any later host reader of `.agent-flow/*` (#39 `decisions.jsonl`) uses the same chain.
- **MUST NOT**: let a workspace package bundled into the plugin reach a file outside its own package root by relative path; whatever `core` needs at runtime, schemas included, lives under `core/`.
- **MUST**: `daemon/src` stays in the Stryker mutate set at the 100 bar (`stryker.config.json:12-16`): it is the host confinement surface.
- **Out of scope**: panel UI and display sanitisation (#42, `snapshot-contract.md:66`), push (#21), agent state (#40, #41), the local host (epic #8), the root `core/` naming (stated deviation, `workspace-layout-core-boundary.md:54`).

## Open questions / Gaps

- [ ] Post-open `realpathSync(dir) === dir` on hosts without `/proc/self/fd`: an optional narrowing of residual (a), not scheduled.
- [ ] #41: a distinct `host-error` refusal reason.
- [ ] #39: the `decisions.jsonl` read through the same chain.
