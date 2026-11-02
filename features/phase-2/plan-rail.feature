# context: Phase 2 read-only panel, plan rail (walking skeleton)
# origin: #42
@feature:plan-rail
Feature: Plan rail in the Agent Flow tab
  The panel shows the issue and its steps from the snapshot of the current worktree, and computes nothing itself.

  @scenario:S1
  Scenario: The panel shows the issue title and the steps in plan order
    Given the current worktree works on the issue "Add login" with the steps "Write tests", "Implement" and "Open PR" in that order
    When the user opens the "Agent Flow" tab
    Then the panel shows the title "Add login"
    And the panel lists the steps "Write tests", "Implement" and "Open PR" in that order

  @scenario:S2
  Scenario: A snapshot error is listed instead of crashing the panel
    Given the snapshot of the current worktree carries one error naming step "s4" and field "status"
    When the user opens the "Agent Flow" tab
    Then the panel lists that error
    And the panel stays usable
