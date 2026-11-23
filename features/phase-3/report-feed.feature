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

  @scenario:S3
  Scenario Outline: An unreadable fact file adds a snapshot error and leaves the rest intact
    Given a worktree has the step "dev-a" in progress
    And the verified-fact file of that worktree is <obstacle>
    When the panel asks for the snapshot of that worktree without agents
    Then the plan steps of the snapshot are intact
    And the snapshot carries no verified fact
    And the snapshot has the single error "verified-facts.jsonl" saying "cannot be read"

    Examples:
      | obstacle    |
      | a directory |
      | a FIFO      |
      | a hard link |

  @scenario:S4
  Scenario: A symlinked fact file is refused
    Given a worktree has the step "dev-a" in progress
    And the verified-fact file of that worktree is a symlink to a file outside the worktree
    When the panel asks for the snapshot of that worktree without agents
    Then the plan steps of the snapshot are intact
    And the snapshot carries no verified fact
    And the snapshot has the single error "verified-facts.jsonl" saying "cannot be read"

  @scenario:S5
  Scenario: An over-bound fact file is refused whole
    Given a worktree has the step "dev-a" in progress
    And the verified-fact file of that worktree is one byte over the bound with at most that many characters
    When the panel asks for the snapshot of that worktree without agents
    Then the plan steps of the snapshot are intact
    And the snapshot carries no verified fact
    And the snapshot has the single error "verified-facts.jsonl" saying "exceeds 1048576 characters"

  @scenario:S6
  Scenario: An unattached line of the fact file reaches the issue-level place
    Given a worktree has the step "dev-a" in progress
    And the verified-fact file of that worktree has an unattached vitest line of 12 passed out of 14
    When the panel asks for the snapshot of that worktree without agents
    Then the snapshot carries the issue-level verified fact "12 of 14 passed" from "vitest"
    And the snapshot carries no verified fact
    And the snapshot has no error
