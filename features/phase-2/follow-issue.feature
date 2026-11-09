# context: Phase 2 exit (MVP), follow a real issue from the panel only, run by QA by hand
# origin: #22
@feature:follow-issue @manual
Feature: Follow an issue end to end
  Phase 2 is done when a real issue can be followed without opening a terminal.

  @scenario:S1
  Scenario: A real issue is followed from the panel only
    Given a real issue is worked end to end by agents
    When I follow it only from the Agent Flow panel
    Then I can tell at any moment which step is current and for how long
    And I can read every decision of every step
    And I can see the state of the agent on the current step
