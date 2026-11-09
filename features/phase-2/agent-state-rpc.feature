# context: Phase 2 daemon reports the agent state with the snapshot
# origin: #41
@feature:agent-state-rpc
Feature: Agent state in the snapshot
  The daemon asks the host which agent works on the worktree and hands role and raw status to core; core maps it.

  @scenario:S1
  Scenario: The agent on the step in progress is reported as running
    Given a worktree has the step "dev-a" in progress
    And the host has an agent running on that worktree
    When the panel asks for the snapshot of that worktree
    Then the current agent is "dev-a" in the state "running"

  @scenario:S2
  Scenario Outline: A host failure leaves the rest of the snapshot intact
    Given a worktree has the step "dev-a" in progress
    And the host agent list <outcome>
    When the panel asks for the snapshot of that worktree
    Then the plan steps of the snapshot are intact
    And the snapshot has no current agent
    And the snapshot has exactly one error labelled "agent-state"

    Examples:
      | outcome            |
      | fails              |
      | refuses permission |

  @scenario:S3
  Scenario: An idle host agent is reported as stopped
    Given a worktree has the step "dev-a" in progress
    And the host has an agent that is idle on that worktree
    When the panel asks for the snapshot of that worktree
    Then the current agent is "dev-a" in the state "stopped"

  @scenario:S4
  Scenario: An agent of another worktree is not reported
    Given a worktree has the step "dev-a" in progress
    And the only host agent works on a different worktree
    When the panel asks for the snapshot of that worktree
    Then the snapshot has no current agent
