# context: Phase 3 daemon feeds the verified facts of the worktree into the snapshot
# origin: #112
@feature:report-feed
Feature: Verified facts in the snapshot
  The daemon reads the worktree's verified-fact file, the sixth `.agent-flow` file, and hands its text to core; core reads the lines. It reads no report file at a default tool path.

  @scenario:S1
  Scenario: The snapshot carries a verified fact read from the worktree
    Given a worktree has the step "dev-a" in progress
    And the verified-fact file of that worktree has a vitest line of 1791 passed out of 1791 on step "s1"
    When the panel asks for the snapshot of that worktree without agents
    Then the step "s1" of the snapshot carries the verified fact "1791 of 1791 passed" from "vitest"

  @scenario:S2
  Scenario: A missing fact file is no error
    Given a worktree has the step "dev-a" in progress
    When the panel asks for the snapshot of that worktree without agents
    Then the snapshot carries no verified fact
    And the snapshot has no error
