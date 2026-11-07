# context: Phase 1 capture, plan.json born from a real run with no human edit
# origin: #78
@feature:plan-seeding
Feature: Plan seeding
  A real run on a worktree with no plan.json ends with a plan that passes contract validation: the operator seeds the issue and title, each runtime adds the steps as the agent creates them.

  @scenario:S1
  Scenario: Seeding a worktree without a plan creates an empty valid plan
    Given a worktree without a plan.json
    When the operator seeds the plan with issue "78" and title "Seed plan.json on real runs"
    Then the worktree's .agent-flow plan.json has issue "#78", title "Seed plan.json on real runs" and no steps
    And the plan.json passes contract validation

  @scenario:S2
  Scenario: Seeding never replaces an existing plan
    Given a worktree whose plan has step "s1" todo
    When the operator seeds the plan with issue "78" and title "Seed plan.json on real runs"
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
