# context: Phase 0 Paseo host spike, messaging a running agent
# origin: #27
@feature:host-agent-message @manual
Feature: Paseo host spike
  Phase 0 proves the host can render a panel, read agent state and reach an agent.

  @scenario:S1
  Scenario: The daemon delivers a message to a running agent
    Given an agent is running in a workspace
    When the daemon sends the message "ping from agent-flow" through the host SDK
    Then the agent receives "ping from agent-flow"
