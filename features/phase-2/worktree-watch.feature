Feature: Watching worktrees
  The daemon follows the .agent-flow/ directory of every active worktree independently.

  Scenario: A change in plan.json reaches the panel
    Given the daemon watches a worktree
    When an agent marks a step as done in that worktree
    Then the next snapshot of that worktree shows the step as done

  Scenario: Worktrees do not leak into each other
    Given two worktrees each work on a different issue
    When a step changes in the first worktree
    Then the snapshot of the second worktree is unchanged

  Scenario: A malformed file does not break the snapshot
    Given decisions.jsonl contains a malformed line
    When the daemon builds the snapshot
    Then the valid decisions are present
    And the snapshot reports the malformed line
