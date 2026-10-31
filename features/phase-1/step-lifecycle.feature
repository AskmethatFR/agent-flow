# context: Phase 1 core, step lifecycle on plan.json
# origin: #33
@feature:step-lifecycle
Feature: Step lifecycle
  Core moves a plan step from todo to in_progress to done, and at most one step is in progress at a time.

  @scenario:S1
  Scenario: Starting a todo step puts it in progress
    Given a lifecycle plan where step "s1" is todo
    When step "s1" is started at "2026-01-01T10:00:00.000Z"
    Then step "s1" is in progress
    And step "s1" has startedAt "2026-01-01T10:00:00.000Z"

  @scenario:S2
  Scenario: Finishing an in-progress step marks it done at the given instant
    Given a lifecycle plan where step "s1" is in progress since "2026-01-01T10:00:00.000Z"
    When step "s1" is finished at "2026-01-01T11:00:00.000Z"
    Then step "s1" is done
    And step "s1" has endedAt "2026-01-01T11:00:00.000Z"

  @scenario:S3
  Scenario: Starting a step closes the step that was in progress
    Given a lifecycle plan where step "s1" is in progress since "2026-01-01T10:00:00.000Z"
    And step "s2" is todo
    When step "s2" is started at "2026-01-01T10:30:00.000Z"
    Then step "s1" is done
    And step "s1" has endedAt "2026-01-01T10:30:00.000Z"
    And step "s2" is in progress
    And step "s2" has startedAt "2026-01-01T10:30:00.000Z"
    And exactly 1 step is in progress

  @scenario:S4
  Scenario: Starting an unknown step is refused
    Given a lifecycle plan where step "s1" is todo
    When step "s9" is started at "2026-01-01T10:00:00.000Z"
    Then the lifecycle change is refused with an error naming step "s9"
    And the lifecycle plan is unchanged

  @scenario:S5
  Scenario: Finishing an in-progress step at its own start instant is allowed
    Given a lifecycle plan where step "s1" is in progress since "2026-01-01T10:00:00.000Z"
    When step "s1" is finished at "2026-01-01T10:00:00.000Z"
    Then step "s1" is done
    And step "s1" has endedAt "2026-01-01T10:00:00.000Z"

  @scenario:S6
  Scenario: Finishing a step at an instant before its start is refused
    Given a lifecycle plan where step "s1" is in progress since "2026-01-01T10:00:00.000Z"
    When step "s1" is finished at "2026-01-01T09:59:59.000Z"
    Then the lifecycle change is refused
    And the lifecycle plan is unchanged

  @scenario:S7
  Scenario Outline: Finishing a step that is not in progress is refused
    Given a lifecycle plan where step "s1" is <state>
    When step "s1" is finished at "2026-01-01T11:00:00.000Z"
    Then the lifecycle change is refused
    And the lifecycle plan is unchanged

    Examples:
      | state |
      | todo  |
      | done  |

  @scenario:S8
  Scenario: Starting a step at an instant before the open step began is refused
    Given a lifecycle plan where step "s1" is in progress since "2026-01-01T10:00:00.000Z"
    And step "s2" is todo
    When step "s2" is started at "2026-01-01T09:00:00.000Z"
    Then the lifecycle change is refused with an error naming step "s1"
    And the lifecycle plan is unchanged
