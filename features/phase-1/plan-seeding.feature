# context: Phase 1 capture, plan.json born from a real run with no human edit
# origin: #78
@feature:plan-seeding
Feature: Plan seeding
  A real run on a worktree with no plan.json ends with a plan that passes contract validation: the tower seeds the issue and title when it starts the worker, each runtime adds the steps as the agent creates them.

  @scenario:S1
  Scenario: Seeding a worktree without a plan creates an empty valid plan
    Given a worktree without a plan.json
    When the tower seeds the plan with issue "78" and title "Seed plan.json on real runs"
    Then the worktree's .agent-flow plan.json has issue "#78", title "Seed plan.json on real runs" and no steps
    And the plan.json passes contract validation

  @scenario:S2
  Scenario: Seeding never replaces the plan of another issue
    Given a worktree whose plan for issue "#34" has step "s1" todo
    When the tower seeds the plan with issue "78" and title "Seed plan.json on real runs"
    Then the seed is refused with an error saying the plan already exists
    And the plan.json bytes are unchanged

  @scenario:S3
  Scenario Outline: A step created by the agent is timed with its role and title
    Given a worktree seeded with issue "78" and title "Seed plan.json on real runs"
    And a <runtime> agent creates the item "dev-a: Implementation"
    And the agent starts the item
    When the agent marks the item as done
    Then plan.json has the step "Implementation" with role "dev-a", origin planned, a startedAt and an endedAt
    And the plan.json passes contract validation

    Examples:
      | runtime     |
      | Claude Code |
      | OpenCode v2 |

  @scenario:S4
  Scenario Outline: A step created after another step has started is proposed
    Given a worktree seeded with issue "78" and title "Seed plan.json on real runs"
    And a <runtime> agent creates the item "dev-a: Implementation"
    And the agent starts the item
    When the agent creates the item "qa: Extra check"
    Then plan.json has the step "Extra check" with role "qa", origin proposed and status todo

    Examples:
      | runtime     |
      | Claude Code |
      | OpenCode v2 |

  @scenario:S5
  Scenario Outline: The runtime loads the plan step naming rule
    Given the agent rules installed for <runtime>
    When a <runtime> session loads its rules
    Then the rules include rules/plan-steps.md

    Examples:
      | runtime     |
      | Claude Code |
      | OpenCode v2 |

  @scenario:S6
  Scenario: Seeding a plan that already names the same issue keeps it and succeeds
    Given a worktree whose plan for issue "#78" has step "s1" todo
    When the tower seeds the plan with issue "78" and title "Seed plan.json on real runs"
    Then the seed reports success so the worker start proceeds
    And the plan.json bytes are unchanged

  @scenario:S7
  Scenario: The launcher exits 3 when the plan already exists
    Given a worktree whose plan for issue "#34" has step "s1" todo
    When the tower runs agent-flow-plan on the worktree with issue "78" and title "Seed plan.json on real runs"
    Then the launcher exits with code 3

  @scenario:S8
  Scenario Outline: An invalid issue or title is refused and writes no plan
    Given a worktree without a plan.json
    When the tower runs agent-flow-plan on the worktree with issue "<issue>" and title "<title>"
    Then the launcher exits with a non-zero code other than 3
    And the worktree has no plan.json

    Examples:
      | issue | title                       |
      | abc   | Seed plan.json on real runs |
      | 0     | Seed plan.json on real runs |
      | 78    |                             |

  @scenario:S9
  Scenario: Seeding writes only inside the worktree's .agent-flow directory
    Given a worktree without a plan.json and content outside its .agent-flow directory
    When the tower seeds the plan with issue "78" and title "Seed plan.json on real runs"
    Then nothing outside the worktree's .agent-flow directory has changed
