# context: Phase 2 read-only panel, snapshot
# origin: #38
@feature:snapshot-steps
Feature: Snapshot of the plan steps with time spent
  Core builds one snapshot from a worktree's plan.json; the panel and the daemon only display it.

  @scenario:S1
  Scenario: A step in progress shows its time spent and is the current step
    Given the time is 10:38 and the plan has a step "s1" in progress that started at 10:00
    When core builds the snapshot
    Then step "s1" shows "38 min" spent and is the current step

  @scenario:S2
  Scenario: A done step shows the time between its start and its end
    Given the time is 12:00 and the plan has a step "s1" done that started at 09:00 and ended at 10:15
    When core builds the snapshot
    Then step "s1" shows "1 h 15 min" spent

  @scenario:S3
  Scenario: A step not yet started shows no time
    Given the time is 10:38 and the plan has a step "s1" still to do
    When core builds the snapshot
    Then step "s1" shows no time spent

  @scenario:S4
  Scenario: No step is current when none is in progress
    Given the time is 12:00 and the plan has one step done and one step still to do
    When core builds the snapshot
    Then the snapshot has no current step

  @scenario:S5
  Scenario: An invalid plan gives errors and no steps
    Given the time is 10:38 and the plan has a step "s4" with status "paused"
    When core builds the snapshot
    Then the snapshot has no steps and one error naming step "s4" and field "status"
