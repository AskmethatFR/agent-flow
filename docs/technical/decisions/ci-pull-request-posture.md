---
id: "ci-pull-request-posture"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-10-26"
relations:
  depends-on: ["workspace-layout-core-boundary"]
answers:
  - "Which workflows run on a pull request, and with which token permissions?"
  - "Why is CI triggered by pull_request and never pull_request_target?"
  - "How are third-party actions and dependencies pinned in CI, and why is there no cache?"
  - "Which CI check names do branch-protection rules bind to, and which are required today?"
  - "Where do the Gherkin scenarios run on a pull request?"
decided_in:
  - "#9"
  - "#29"
---

# CI posture on pull requests

> **One-liner**: Every pull-request workflow follows one least-privilege posture: lockfile-exact install, no secrets, no write token, no dependency install scripts. Today that covers `ci` (tests and typecheck) and `bdd` (Gherkin scenarios).
> **Links**: [[workspace-layout-core-boundary]] (the `test`, `typecheck` and `bdd` scripts these workflows run).

## Context

The repository accepts pull requests, and every later slice inherits this pipeline. Its workflows run untrusted pull-request code, so the token, the trigger and the supply chain are the attack surface. #9 added `ci` (`.github/workflows/ci.yml:1-26`). #29 added `bdd` (`.github/workflows/bdd.yml:1-25`) under the same rules, one workflow file per job. The mutation workflow (#30) comes later.

## Decision / Specification

The rules apply to every pull-request workflow. Anchors cite `ci.yml`; `bdd.yml` uses the same lines unless noted.

| Concern | Decision | Rationale |
|---|---|---|
| Trigger | `on: pull_request` only (`ci.yml:3`, `bdd.yml:3`) | `pull_request_target` would run fork code with a write token and repository secrets |
| Token | Top-level `permissions: contents: read` (`ci.yml:5-6`); checkout with `persist-credentials: false` (`ci.yml:17-19`); no secrets, no `env` tokens | Least privilege; no credential stays on disk for later steps |
| Action pinning | Every action pinned to its full commit SHA with a trailing version comment (`ci.yml:17`, `ci.yml:20`). Both workflows pin the same SHAs | A moved tag cannot change what runs |
| Install | `npm ci --ignore-scripts` (`ci.yml:24`) | Lockfile-exact install; no dependency lifecycle script runs |
| Cache | None: `package-manager-cache: false` (`ci.yml:23`) | Smaller cache-poisoning surface; the install is small |
| Checks | `ci`: `npm test`, then `npm run typecheck` (`ci.yml:25-26`). `bdd`: `npm run bdd` (`bdd.yml:25`) | The same commands a developer runs locally |
| Identity | Workflow `ci`, job `test` (`ci.yml:1`, `ci.yml:13`); workflow `bdd`, job `bdd` (`bdd.yml:1`, `bdd.yml:13`) | Branch-protection required checks bind to these names; renaming one silently drops its gate |
| Bounds | `timeout-minutes: 10`; one concurrency group per workflow and ref (`ci-…`, `bdd-…`) with cancel-in-progress (`ci.yml:8-15`) | A hung run cannot hold a runner; a new push cancels the stale run of that workflow only |
| Node | The Node line is set at `ci.yml:22`; the floor lives in `package.json` `engines` | One source for the floor |
| Split | One workflow file per job (`ci`, `bdd`), never a second job inside `ci.yml` | Each gate has its own check identity and fails on its own |

### Considered and rejected

| Option | Why rejected |
|---|---|
| `pull_request_target` | Write token and secrets on fork code |
| Tag-pinned actions (`@v7`) | A tag can be moved to other code |
| `actions/setup-node` cache | Poisoning surface for a small install |
| `npm audit` in CI | An upstream advisory would turn every pull request red, unrelated to the change |
| Allowing install scripts | No dependency needs one; the run passes with them disabled |
| BDD as a step or job inside `ci.yml` | Couples two gates under one identity; one workflow per job was decided in #29 |

## Consequences / Constraints

- **MUST**: keep the `ci` / `test` and `bdd` / `bdd` identities stable, or update branch protection in the same change.
- **MUST**: pin a new or upgraded action by full SHA with its version comment. A SHA bump changes every pull-request workflow (`ci.yml`, `bdd.yml`) in the same change.
- **MUST**: a new pull-request workflow adopts every row of the table above.
- **MUST NOT**: add `pull_request_target`, a write permission or a secret to any of these workflows.
- **MUST NOT**: drop `--ignore-scripts` silently; a dependency that needs its install script is a declared decision with a reviewer ruling.
- **Out of scope**: dependency scanning (Dependabot, `npm audit`, CodeQL); the mutation workflow (#30), which adopts this posture when it lands.

## Open questions / Gaps

- [ ] `bdd` / `bdd` is not yet a required status check in branch protection. Binding it is a human action in the repository settings, outside any pull request.
- [ ] Where does dependency-advisory scanning run, if not in these workflows?
