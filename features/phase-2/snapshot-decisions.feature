# context: Phase 2 core snapshot, decisions grouped by step (S1 moved from worktree-watch)
# origin: #39
@feature:snapshot-decisions
Feature: Core snapshot: decisions grouped by step
  Core attaches every logged decision to its plan step, so the panel only displays.

  @scenario:S1
  Scenario: A malformed file does not break the snapshot
    Given decisions.jsonl contains a malformed line
    When the snapshot is built
    Then the valid decisions are present
    And the snapshot reports the malformed line

  @scenario:S2
  Scenario: Decisions are grouped by their step
    Given the plan has steps "s1" and "s2" and decisions are logged for both
    When the snapshot is built
    Then step "s1" lists only the decisions logged for "s1" with title, why, rejected options, role and confidence

  @scenario:S3
  Scenario: A step without a decision has none
    Given the plan has a step "s2" and no decision is logged for "s2"
    When the snapshot is built
    Then step "s2" lists no decision
