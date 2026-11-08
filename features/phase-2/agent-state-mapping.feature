# context: Phase 2 read-only panel, agent display state
# origin: #40
@feature:agent-state-mapping
Feature: Display state of the agent on the current step
  Core maps the raw host agent status to a display state; the adapter and the panel never map it.

  @scenario:S1
  Scenario: A running host status displays as running
    Given the adapter reports the role "dev-a" with the host status "running"
    When core builds the snapshot
    Then the current agent is "dev-a" in the state "running"

  @scenario:S2
  Scenario: An idle host status displays as stopped
    Given the adapter reports the role "dev-a" with the host status "idle"
    When core builds the snapshot
    Then the current agent is "dev-a" in the state "stopped"

  @scenario:S3
  Scenario: A host status outside the list displays as unknown
    Given the adapter reports the role "dev-a" with the host status "paused"
    When core builds the snapshot
    Then the current agent is "dev-a" in the state "unknown"

  @scenario:S4
  Scenario: No agent reported leaves the current agent out
    Given the adapter reports no role and no host status
    When core builds the snapshot
    Then the snapshot has no current agent
