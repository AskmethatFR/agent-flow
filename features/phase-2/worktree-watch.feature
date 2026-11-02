# context: Phase 2 daemon per-worktree snapshot RPC (former S3 moved to snapshot-decisions)
# origin: #18
@feature:worktree-watch
Feature: Watching worktrees
  The daemon follows the .agent-flow/ directory of every active worktree independently.

  @scenario:S1
  Scenario: A change in plan.json reaches the panel
    Given the daemon watches a worktree
    When an agent marks a step as done in that worktree
    Then the next snapshot of that worktree shows the step as done

  @scenario:S2
  Scenario: Worktrees do not leak into each other
    Given two worktrees each work on a different issue
    When a step changes in the first worktree
    Then the snapshot of the second worktree is unchanged

  @scenario:S3
  Scenario: A workspace the host does not know as a worktree is refused
    Given the panel names a workspace that the host cannot map to a known worktree
    When the panel asks for the snapshot of that workspace
    Then the request is refused with the reason "unknown-worktree"
    And the answer carries nothing from any worktree's plan
