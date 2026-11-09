import { defineRpc } from '@getpaseo/plugin'
import { z } from 'zod'

const ContractErrorSchema = z.object({
  file: z.string(),
  location: z.union([z.string(), z.number(), z.null()]),
  field: z.string().nullable(),
  message: z.string(),
}).readonly()

const SnapshotDecisionSchema = z.object({
  title: z.string(),
  why: z.string(),
  rejected: z.array(z.string()).readonly(),
  role: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
}).readonly()

const SnapshotStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  role: z.string(),
  status: z.enum(['todo', 'in_progress', 'done']),
  origin: z.enum(['planned', 'proposed']),
  timeSpent: z.object({ milliseconds: z.number(), label: z.string() }).readonly().nullable(),
  decisions: z.array(SnapshotDecisionSchema).readonly(),
  omittedDecisions: z.number().int().nonnegative(),
}).readonly()

export const SnapshotSchema = z.object({
  issue: z.string().nullable(),
  title: z.string().nullable(),
  steps: z.array(SnapshotStepSchema).readonly(),
  currentStepId: z.string().nullable(),
  currentAgent: z
    .object({ role: z.string(), state: z.enum(['running', 'stopped', 'unknown']) })
    .readonly()
    .nullable(),
  errors: z.array(ContractErrorSchema).readonly(),
}).readonly()

export const getSnapshotRpc = defineRpc({
  name: 'get-snapshot',
  input: z.strictObject({ workspaceId: z.string().min(1).max(256) }),
  output: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('snapshot'), snapshot: SnapshotSchema }).readonly(),
    z.object({ kind: z.literal('refused'), reason: z.literal('unknown-worktree') }).readonly(),
  ]),
})
