# context: Phase 2 daemon, per-worktree snapshot RPC
# origin: #18
@feature:worktree-watch
Feature: Per-worktree snapshot served by the daemon
  The daemon answers getSnapshot for one worktree at a time, from that worktree's own plan only; the panel only displays it.

  @scenario:S1
  Scenario: Each worktree's snapshot reflects only its own plan
    Given two worktrees, each with its own plan where step "s1" is in progress
    When step "s1" is finished in the first worktree
    Then the first worktree's snapshot shows step "s1" as done
    And the second worktree's snapshot is unchanged

  @scenario:S2
  Scenario: A workspace the host does not know as a worktree is refused
    Given a workspace the host cannot map to a known worktree
    When the snapshot of that workspace is requested
    Then the request is refused with the reason "unknown-worktree"
    And no plan is read
