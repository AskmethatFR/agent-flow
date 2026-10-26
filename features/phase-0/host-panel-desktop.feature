# context: Phase 0 Paseo host spike, desktop rendering
# origin: #10
@feature:host-panel-desktop @manual
Feature: Paseo host spike
  Phase 0 proves the host can render a panel, read agent state and reach an agent.

  @scenario:S1
  Scenario: An empty panel renders on desktop
    Given the agent-flow plugin is installed in Paseo desktop
    When I open the "Agent Flow" workspace tab
    Then an empty panel is displayed
