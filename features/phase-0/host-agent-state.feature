# context: Phase 0 Paseo host spike, reading agent state through the SDK
# origin: #26
@feature:host-agent-state @manual
Feature: Paseo host spike
  Phase 0 proves the host can render a panel, read agent state and reach an agent.

  @scenario:S1
  Scenario: The daemon reads the state of a running agent
    Given an agent is running in a workspace
    When the daemon asks the host SDK for that agent's state
    Then it receives the agent's current status
