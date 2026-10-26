import assert from 'node:assert/strict'
import { Given, Then, When } from '@cucumber/cucumber'
import { validatePlan } from '@agent-flow/core/contracts'
import type { ValidationResult } from '@agent-flow/core/contracts'

type ContractWorld = { file: string; text: string; result: ValidationResult }

const validPlanSample = `{
  "issue": "#142",
  "title": "Magic link authentication",
  "steps": [
    {
      "id": "s4",
      "title": "Implementation",
      "role": "dev-a",
      "status": "in_progress",
      "origin": "planned",
      "startedAt": "2026-10-22T10:31:00Z",
      "endedAt": null
    }
  ]
}`

const validSamples: Record<string, string> = { 'plan.json': validPlanSample }

const validators: Record<string, (text: string) => ValidationResult> = {
  'plan.json': validatePlan,
}

const known = <T>(registry: Record<string, T>, file: string): T => {
  const entry = Object.hasOwn(registry, file) ? registry[file] : undefined
  if (entry === undefined) throw new Error(`unknown contract file: ${file}`)
  return entry
}

Given('a valid {string} sample', function (this: ContractWorld, file: string): void {
  this.file = file
  this.text = known(validSamples, file)
})

Given(
  'a plan.json whose step {string} has status {string}',
  function (this: ContractWorld, stepId: string, status: string): void {
    const plan = JSON.parse(validPlanSample)
    plan.steps[0] = { ...plan.steps[0], id: stepId, status }
    this.file = 'plan.json'
    this.text = JSON.stringify(plan)
  },
)

When('core validates it', function (this: ContractWorld): void {
  this.result = known(validators, this.file)(this.text)
})

Then('it is accepted', function (this: ContractWorld): void {
  assert.deepEqual(this.result, { accepted: true })
})

Then(
  'it is rejected with an error naming step {string} and field {string}',
  function (this: ContractWorld, stepId: string, field: string): void {
    assert.ok(!this.result.accepted)
    assert.equal(this.result.errors.length, 1)
    const [error] = this.result.errors
    assert.deepEqual(
      { file: error.file, location: error.location, field: error.field },
      { file: this.file, location: stepId, field },
    )
    assert.equal(typeof error.message, 'string')
  },
)
