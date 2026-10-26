# context: Phase 0 Paseo host spike, mobile rendering
# origin: #31
@feature:host-panel-mobile @manual
Feature: Paseo host spike
  Phase 0 proves the host can render a panel, read agent state and reach an agent.

  @scenario:S1
  Scenario: An empty panel renders on mobile
    Given the agent-flow plugin is installed
    When I open the "Agent Flow" workspace tab from the Paseo mobile app
    Then an empty panel is displayed
