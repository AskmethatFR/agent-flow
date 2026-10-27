import assert from 'node:assert/strict'
import { Given, Then, When } from '@cucumber/cucumber'
import { readDecisions, validateDecisions, validatePlan } from '@agent-flow/core/contracts'
import type { ReadDecisionsResult, ValidationResult } from '@agent-flow/core/contracts'

type ContractWorld = {
  file: string
  text: string
  result: ValidationResult
  read?: ReadDecisionsResult
}

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

const validDecisionSample =
  '{"at":"2026-10-22T11:20:00Z","step":"s4","role":"dev-a","model":"sonnet","kind":"decision","title":"Inject TimeProvider to test expiration","why":"Tests token lifetime without real waiting","rejected":["real waits in tests"],"confidence":"high"}'

const validSamples: Record<string, string> = {
  'plan.json': validPlanSample,
  'decisions.jsonl': validDecisionSample,
}

const validators: Record<string, (text: string) => ValidationResult> = {
  'plan.json': validatePlan,
  'decisions.jsonl': validateDecisions,
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

Given('a decisions.jsonl with 3 valid lines and 1 malformed line', function (this: ContractWorld): void {
  const line = (overlays: Record<string, unknown>): string => JSON.stringify({ ...decisionOf, ...overlays })
  const decisionOf = JSON.parse(validDecisionSample)
  this.file = 'decisions.jsonl'
  this.text = [
    line({ step: 's4' }),
    line({ step: 's5' }),
    '{not json',
    line({ step: 's6' }),
  ].join('\n')
})

When('core validates it', function (this: ContractWorld): void {
  this.result = known(validators, this.file)(this.text)
})

When('core reads it', function (this: ContractWorld): void {
  this.read = readDecisions(this.text)
})

Then('it is accepted', function (this: ContractWorld): void {
  assert.deepEqual(this.result, { accepted: true })
})

Then('3 decisions are returned', function (this: ContractWorld): void {
  assert.ok(this.read !== undefined)
  const decisionOf = JSON.parse(validDecisionSample)
  const expected = [
    { ...decisionOf, step: 's4' },
    { ...decisionOf, step: 's5' },
    { ...decisionOf, step: 's6' },
  ]
  assert.deepEqual(this.read.decisions, expected)
})

Then('1 error names the malformed line number', function (this: ContractWorld): void {
  assert.ok(this.read !== undefined)
  assert.deepEqual(this.read.errors, [
    { file: 'decisions.jsonl', location: 3, field: null, message: 'is not valid JSON' },
  ])
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
