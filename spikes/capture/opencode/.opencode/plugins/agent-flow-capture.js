import { record, shapeOf } from "../../../shared/recorder.mjs"

const PLAN_TOOLS = new Set(["todowrite", "subagent", "task"])

const safely = (fn) => {
  try {
    fn()
  } catch (err) {
    process.stderr.write(`agent-flow-capture: ${err?.message ?? err}\n`)
  }
}

const recordTool = (file, source, event) =>
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

const recordBus = (file, event) => {
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
    const file = process.env.AF_CAPTURE_FILE
    if (!file) return
    const canHook = typeof ctx?.tool?.hook === "function"
    const canSubscribe = typeof ctx?.event?.subscribe === "function"
    if (!canHook && !canSubscribe) {
      process.stderr.write("agent-flow-capture: no tool-hook registrar or event stream — inert\n")
      return
    }
    const stream = new AbortController()
    if (canHook) {
      await ctx.tool.hook("execute.before", (event) => {
        if (!stream.signal.aborted) safely(() => recordTool(file, "execute.before", event))
      })
      await ctx.tool.hook("execute.after", (event) => {
        if (!stream.signal.aborted) safely(() => recordTool(file, "execute.after", event))
      })
    }
    if (canSubscribe) {
      ;(async () => {
        try {
          for await (const event of ctx.event.subscribe({ signal: stream.signal })) {
            safely(() => recordBus(file, event))
            if (event?.type === "location.shutdown") stream.abort()
          }
        } catch (err) {
          if (!stream.signal.aborted) {
            process.stderr.write(`agent-flow-capture: event stream failed (${err?.message ?? err})\n`)
          }
        }
      })()
    }
  },
}
