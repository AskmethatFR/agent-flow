# context: Phase 1 capture, plan writer on .agent-flow/plan.json
# origin: #34
@feature:plan-writer
Feature: Plan writer
  Capture applies a step event to a worktree's plan and writes it back, never touching anything outside the worktree's .agent-flow directory.

  @scenario:S1
  Scenario: Starting a step writes the updated plan inside .agent-flow
    Given a worktree whose plan has step "s1" todo
    When the plan writer applies a start of step "s1" at "2026-01-01T10:00:00.000Z"
    Then the worktree's .agent-flow plan.json has step "s1" in progress since "2026-01-01T10:00:00.000Z"

  @scenario:S2
  Scenario Outline: A target outside .agent-flow is refused and nothing is written
    Given a worktree whose plan has step "s1" todo
    And the plan target is redirected outside .agent-flow by "<redirection>"
    When the plan writer applies a start of step "s1" at "2026-01-01T10:00:00.000Z"
    Then the plan writer refuses the event
    And the outside content and the plan.json are unchanged

    Examples:
      | redirection                                |
      | a worktree path going through ..           |
      | .agent-flow symlinked to an outside folder |
      | plan.json symlinked to an outside file     |

  @scenario:S3
  Scenario Outline: A plan that fails the lifecycle or the contract is not written
    Given a worktree whose plan on disk is "<plan>"
    When the plan writer applies a start of step "<step>" at "2026-01-01T10:00:00.000Z"
    Then the plan writer returns an error naming "<named>"
    And the plan.json bytes are unchanged

    Examples:
      | plan                                | step | named |
      | step s1 todo                        | s9   | s9    |
      | step s4 with unknown status paused  | s4   | s4    |

  @scenario:S4
  Scenario: A worktree without .agent-flow gets the directory but no plan
    Given a worktree without an .agent-flow directory
    When the plan writer applies a start of step "s1" at "2026-01-01T10:00:00.000Z"
    Then the plan writer refuses the event with an error saying the plan is missing
    And the worktree has an .agent-flow directory but no plan.json

  @scenario:S5
  Scenario: Finishing an in-progress step writes it done inside .agent-flow
    Given a worktree whose plan has step "s1" in progress since "2026-01-01T10:00:00.000Z"
    When the plan writer applies a finish of step "s1" at "2026-01-01T11:00:00.000Z"
    Then the worktree's .agent-flow plan.json has step "s1" done with endedAt "2026-01-01T11:00:00.000Z"
