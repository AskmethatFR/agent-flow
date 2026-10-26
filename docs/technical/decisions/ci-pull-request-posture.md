---
id: "ci-pull-request-posture"
type: "technical"
owner: "architect"
status: "current"
updated: "2026-10-26"
relations:
  depends-on: ["workspace-layout-core-boundary"]
answers:
  - "What runs on a pull request, and with which token permissions?"
  - "Why is CI triggered by pull_request and never pull_request_target?"
  - "How are third-party actions and dependencies pinned in CI, and why is there no cache?"
  - "Which CI check name do branch-protection rules bind to?"
decided_in:
  - "#9"
---

# CI posture on pull requests

> **One-liner**: One least-privilege workflow runs the lockfile-exact install, the tests and the typecheck on every pull request, with no secrets, no write token and no dependency install scripts.
> **Links**: [[workspace-layout-core-boundary]] (the `test` and `typecheck` scripts this workflow runs).

## Context

The repository accepts pull requests, and every later slice inherits this pipeline. The workflow (`.github/workflows/ci.yml:1-26`) runs untrusted pull-request code, so the token, the trigger and the supply chain are the attack surface. #9 adds the first workflow; the BDD (#29) and mutation (#30) workflows come later.

## Decision / Specification

| Concern | Decision | Rationale |
|---|---|---|
| Trigger | `on: pull_request` only (`ci.yml:3`) | `pull_request_target` would run fork code with a write token and repository secrets |
| Token | Top-level `permissions: contents: read` (`ci.yml:5-6`); checkout with `persist-credentials: false` (`ci.yml:17-19`); no secrets, no `env` tokens | Least privilege; no credential stays on disk for later steps |
| Action pinning | Every action pinned to its full commit SHA with a trailing version comment (`ci.yml:17`, `ci.yml:20`) | A moved tag cannot change what runs |
| Install | `npm ci --ignore-scripts` (`ci.yml:24`) | Lockfile-exact install; no dependency lifecycle script runs |
| Cache | None: `package-manager-cache: false` (`ci.yml:23`) | Smaller cache-poisoning surface; the install is small |
| Checks | `npm test`, then `npm run typecheck` (`ci.yml:25-26`) | The same two commands a developer runs locally |
| Identity | Workflow `ci`, job `test` (`ci.yml:1`, `ci.yml:13`) | Branch-protection required checks bind to this name; renaming it silently drops the gate |
| Bounds | `timeout-minutes: 10`, concurrency group per ref with cancel-in-progress (`ci.yml:8-15`) | A hung run cannot hold a runner; a new push cancels the stale run |
| Node | The Node line is set in `ci.yml:22`; the floor lives in `package.json` `engines` | One source for the floor |

### Considered and rejected

| Option | Why rejected |
|---|---|
| `pull_request_target` | Write token and secrets on fork code |
| Tag-pinned actions (`@v7`) | A tag can be moved to other code |
| `actions/setup-node` cache | Poisoning surface for a small install |
| `npm audit` in CI | An upstream advisory would turn every pull request red, unrelated to the change |
| Allowing install scripts | No dependency needs one; the run passes with them disabled |

## Consequences / Constraints

- **MUST**: keep the `ci` / `test` identity stable, or update branch protection in the same change.
- **MUST**: pin a new or upgraded action by full SHA with its version comment.
- **MUST NOT**: add `pull_request_target`, a write permission or a secret to this workflow.
- **MUST NOT**: drop `--ignore-scripts` silently; a dependency that needs its install script is a declared decision with a reviewer ruling.
- **Out of scope**: dependency scanning (Dependabot, `npm audit`, CodeQL); the BDD and mutation workflows (#29, #30).

## Open questions / Gaps

- [ ] Do the BDD (#29) and mutation (#30) workflows adopt this posture? Recommended, not decided in #9.
- [ ] Where does dependency-advisory scanning run, if not in this workflow?
