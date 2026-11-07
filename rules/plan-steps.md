# Plan steps

Name every item of your plan so the team can see who does what and when. Agent Flow turns each item you create into one step of the run's plan.

## Name

Write each item as `<role-id>: <title>`: the id of the role that does the work, a colon, one space, then a short title.

- Take the role id from the role table of the decision-logging rule. Never invent another one.
- Example: `dev-a: Implementation`.
- An item without a role id still becomes a step, but it has no role and the panel cannot place it.

## Create the whole plan first

Create every item you already know about before you start the first one. An item created after another one has started is shown as a proposed step, not a planned one.

## Start and finish

Mark an item in progress when its work starts and done when its work ends. Items worked at the same time are in progress together: starting one never ends another.

To rework a finished item, mark it in progress again, and done after. The rework shows as its own step, titled with the item title and `(rework <n>)`, and the finished step keeps its times.

## Never rename

Never edit the text of an item once you have created it. Depending on the runtime, an edit is ignored or counted as a new item; either way the step already in the plan keeps the name it was created with.
