---
id: "workspace-layout-core-boundary"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-10-26"
relations:
  related: ["capture-events"]
answers:
  - "How is the repository split into packages, and how is a new package added?"
  - "How does a consumer import core, and why is there no root entry point?"
  - "How is the rule 'core imports no host, no sibling package and no Node built-in' enforced?"
  - "Why does TypeScript only typecheck, with Bundler resolution, and why is it pinned below 7?"
  - "Why are spikes never built, typechecked or tested?"
decided_in:
  - "#9"
---

# Workspace layout and the core import boundary

> **One-liner**: The repository is one npm-workspaces root with an explicit package list, one root toolchain, subpath-only access to `core`, and a test that fails `npm test` when `core` imports something it must not.
> **Links**: [[capture-events]] (its "shared versus runtime-specific" split is what this boundary enforces). The CI that runs these checks is recorded in `ci-pull-request-posture`, which depends on this node.

## Context

`.claude/CLAUDE.md:7-9` sets the rule: `core/` is pure TypeScript with no host import, `daemon/` is the Paseo adapter, `panel/` is display only. `docs/plan.md:41` adds that Paseo compiles TypeScript itself, so plugins need no build step. Before #9 there was no package, no compiler and no test runner, so the rule was prose only. Three capture adapters (shared, Claude Code, OpenCode) were added as packages alongside the three in the plan. Later slices (#23 step definitions, #29 BDD, #30 mutation) cannot touch the lockfile or root config, so the shape had to be fixed here.

## Decision / Specification

| Concern | Decision | Rationale |
|---|---|---|
| Package list | npm workspaces, literal entries, no glob (`package.json:9-16`). Top-level folders: `core`, `daemon`, `panel`, `capture/<adapter>` | A glob would let `spikes/**` or a stray folder become a package. Adding a package is a deliberate edit to three places: the workspace list, a vitest project and the tsconfig include |
| Package naming | `@agent-flow/<name>`, every package `private`, version `0.0.0`, no dependencies of its own | The scope is what the boundary rule matches; nothing is published |
| Toolchain | Every dev-dependency at the root, exact pins, one committed lockfile (`package.json:23-31`). Node floor: see `package.json` `engines` | One install for CI, BDD and mutation; exact pins narrow the supply-chain surface |
| Compiler | Typecheck only: `noEmit`, `moduleResolution: Bundler`, strict (`tsconfig.base.json:1-15`). One root `tsconfig.json` with an include list; no per-package tsconfig, no project references | Paseo compiles the sources; Bundler is what lets extensionless imports and `.ts` export targets resolve |
| Test runner | One root `vitest.config.ts`, one inline project per workspace (`vitest.config.ts:9-16`); `npm test` = `vitest run`. No `passWithNoTests` | One process; the harness detects vitest from the root config; a run with zero tests anywhere stays red |
| Access to core | `core/package.json:6-8`: `"./*" -> "./src/*/index.ts"`, no `"."` entry | Consumers import a module (`@agent-flow/core/<module>`), never a barrel; each module folder exposes one `index.ts`. A test resolves every `core/src` folder through the map (`core/test/package-exports.test.ts:14`), so new modules are covered without edits |
| Boundary rule | A vitest test in `core/test/` scans every source file under `core/src` and fails on four rule kinds: sibling workspace (by `@agent-flow/` name or by a relative path into `daemon`, `panel`, `capture`), host package (`paseo`/`opencode`, any case), React Native, Node built-in (`isBuiltin`) (`core/test/import-boundary.ts:16-47`) | Turns `.claude/CLAUDE.md:7` into a red build. Specifiers come from the TypeScript parser (`import-boundary.ts:63`), so `import()`, `require`, `export ... from` and type imports are seen and comments are not |
| Scanner placement | The scanner lives in `core/test/`, not `core/src/` | It imports `node:` modules and `typescript`; under `core/src` it would break its own rule and enter the mutation scope |
| Config perimeter | Two tests read the config itself: every workspace, include and vitest root stays under an allowlisted top-level folder (`core/test/spike-exclusion.test.ts:14-33`), and every glob a vitest project collects is covered by the tsconfig include (`core/test/typecheck-coverage.test.ts:38-48`) | `spikes/` stays out by construction, and a test file that runs but is never typechecked fails the build |
| Panel | `panel/` is the Paseo plugin root; its entry is `panel/index.client.tsx` (human ruling on #10), with no `src/`. The panel project collects `**/*.test.{ts,tsx}` under `panel/` (`vitest.config.ts:12`); the tsconfig includes the entry and the test globs only (`tsconfig.json:7-9`), with no `jsx` option | Panel folders are owned by #10, #18 and #42, so the glob needs no edit when they appear. Including all of `panel/` would drag React sources into a config with no JSX or React types |

### Considered and rejected

| Option | Why rejected |
|---|---|
| dependency-cruiser or an ESLint import rule | A new dependency and config surface for one rule |
| Regex import scanner | Misses `import()` and `require`, matches comments |
| `capture/*` workspace glob | Same leak risk as any glob; the three adapters are named |
| `npm test --workspaces` | Six processes, and an empty workspace exits 1 |
| `NodeNext` resolution | Forces `.js` extensions on `.ts` sources that Paseo compiles itself |
| Caret version ranges | Weaker supply-chain pin |
| TypeScript 7 | Its native port exposes no `preProcessFile`; the scanner depends on it (`package.json:29`) |
| Renaming `core/` (its name is on the screaming-architecture closed root list) | Fixed by `.claude/CLAUDE.md:7` and `docs/plan.md:51`; a rename would touch every later import path. A stated deviation, not an oversight |

## Consequences / Constraints

- **MUST**: add a package by editing the workspace list, a vitest project and the tsconfig include together; the perimeter tests fail otherwise.
- **MUST**: put each `core` module in its own folder under `core/src` with an `index.ts`; that is the only public surface of `core`.
- **MUST NOT**: add a `"."` export to `core`, or import `core` by relative path from another package.
- **MUST NOT**: import from `core/src` anything the boundary rule flags. The rule also flags an npm package whose bare name equals a Node built-in (`events`, `buffer`).
- **MUST NOT**: move the scanner into `core/src`, or upgrade TypeScript to a release without `preProcessFile`, without replacing the scanner in the same change.
- **Review-enforced only**: Node globals (`process`, `Buffer`) and relative imports that leave `core` for somewhere other than a sibling package (for example a schemas folder). The test does not see them.
- **Out of scope**: runtime dependencies of `daemon`, `panel` and `capture`; the plugin manifest and panel entry path (#10); cucumber and Stryker config (#29, #30).

## Open questions / Gaps

- [ ] The exact host-adapter boundary for a later standalone host (`docs/plan.md:60`, open question 7) is not decided here; this node only fixes what `core` may not import.
- [ ] Should the boundary also flag Node globals? Not decided; review-enforced today.
