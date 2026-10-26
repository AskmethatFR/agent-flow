import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { record, shapeOf } from "../../../shared/recorder.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const file = join(here, "..", "..", "samples", "events.jsonl")
const PLAN_TOOLS = new Set(["todowrite", "subagent", "task"])

const safely = (fn) => {
  try {
    fn()
  } catch (err) {
    process.stderr.write(`agent-flow-capture: ${err?.message ?? err}\n`)
  }
}

const recordTool = (source, event) =>
  record({
    file,
    runtime: "opencode",
    source,
    kind: "tool-hook",
    payload: PLAN_TOOLS.has(event?.tool)
      ? {
          tool: event.tool,
          status: event.status,
          sessionID: event.sessionID,
          input: event.input,
          result: event.result,
        }
      : { tool: event?.tool, status: event?.status },
  })

const isFullyRecorded = (type) => /todo/.test(type) || type === "session.created"

const recordBus = (event) => {
  const type = String(event?.type ?? "")
  if (type.endsWith(".delta")) return
  record({
    file,
    runtime: "opencode",
    source: type,
    kind: "bus",
    payload: isFullyRecorded(type) ? { type, data: event.data } : { type, shape: shapeOf(event.data) },
  })
}

export default {
  id: "agent-flow.capture-spike",
  async setup(ctx) {
    const canHook = typeof ctx?.tool?.hook === "function"
    const canSubscribe = typeof ctx?.event?.subscribe === "function"
    if (!canHook && !canSubscribe) {
      process.stderr.write("agent-flow-capture: no tool-hook registrar or event stream — inert\n")
      return
    }
    if (canHook) {
      await ctx.tool.hook("execute.before", (event) => safely(() => recordTool("execute.before", event)))
      await ctx.tool.hook("execute.after", (event) => safely(() => recordTool("execute.after", event)))
    }
    if (canSubscribe) {
      ;(async () => {
        try {
          for await (const event of ctx.event.subscribe({ signal: undefined })) {
            safely(() => recordBus(event))
          }
        } catch (err) {
          process.stderr.write(`agent-flow-capture: event stream failed (${err?.message ?? err})\n`)
        }
      })()
    }
  },
}
