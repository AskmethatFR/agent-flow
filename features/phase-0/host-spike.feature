Feature: Paseo host spike
  Phase 0 proves the host can render a panel, read agent state and reach an agent.

  Scenario: An empty panel renders on desktop
    Given the agent-flow plugin is installed in Paseo desktop
    When I open the "Agent Flow" workspace tab
    Then an empty panel is displayed

  Scenario: An empty panel renders on mobile
    Given the agent-flow plugin is installed
    When I open the "Agent Flow" workspace tab from the Paseo mobile app
    Then an empty panel is displayed

  Scenario: The daemon reads the state of a running agent
    Given an agent is running in a workspace
    When the daemon asks the host SDK for that agent's state
    Then it receives the agent's current status

  Scenario: The daemon delivers a message to a running agent
    Given an agent is running in a workspace
    When the daemon sends the message "ping from agent-flow" through the host SDK
    Then the agent receives "ping from agent-flow"
