import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(fileURLToPath(import.meta.url))

const tokenShapes = [
  new RegExp("\\b" + "s" + "k-[A-Za-z0-9_-]{16,}"),
  new RegExp("\\b" + "gh" + "p_[A-Za-z0-9]{20,}"),
  new RegExp("\\b" + "gh" + "o_[A-Za-z0-9]{20,}"),
  new RegExp("\\b" + "xo" + "x[bp]-[A-Za-z0-9-]{10,}"),
  new RegExp("\\b" + "AK" + "IA[A-Z0-9]{16}\\b"),
  new RegExp("Bearer\\s+[A-Za-z0-9._-]{20,}"),
]

const loadSamples = (runtime) => {
  const file = join(root, runtime, "samples", "events.jsonl")
  if (!existsSync(file)) return { file, error: "samples/events.jsonl missing", records: [] }
  const text = readFileSync(file, "utf8")
  const records = text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line))
  return { file, text, records }
}

const claudePlan = (records) => {
  const created = []
  const transitions = []
  for (const record of records) {
    const p = record.payload ?? {}
    if (record.source !== "PostToolUse") continue
    if (p.tool_name === "TaskCreate") {
      created.push({ id: p.tool_response?.task?.id ?? p.tool_input?.subject, at: record.at })
    }
    if (p.tool_name === "TaskUpdate" && p.tool_input?.status) {
      transitions.push({ id: p.tool_input.taskId, status: p.tool_input.status, at: record.at })
    }
  }
  const subagents = records.filter((r) => r.source === "SubagentStart" || r.source === "SubagentStop").length
  return { created, transitions, subagents }
}

const opencodePlan = (records) => {
  const created = []
  const transitions = []
  const lastStatus = new Map()
  for (const record of records) {
    const p = record.payload ?? {}
    if (record.source !== "execute.after" || p.tool !== "todowrite") continue
    const todos = p.input?.todos ?? []
    for (const todo of todos) {
      if (!lastStatus.has(todo.content)) {
        created.push({ id: todo.content, at: record.at })
        lastStatus.set(todo.content, "pending")
      }
      if (lastStatus.get(todo.content) !== todo.status) {
        transitions.push({ id: todo.content, status: todo.status, at: record.at })
        lastStatus.set(todo.content, todo.status)
      }
    }
  }
  const subagents = records.filter(
    (r) => r.source === "execute.after" && ["subagent", "task"].includes(r.payload?.tool),
  ).length
  return { created, transitions, subagents }
}

const extractors = { "claude-code": claudePlan, opencode: opencodePlan }

const checkRuntime = (runtime) => {
  const { file, text, records, error } = loadSamples(runtime)
  if (error) return [{ name: "samples present", ok: false, detail: error }]
  const { created, transitions, subagents } = extractors[runtime](records)
  const started = transitions.filter((t) => t.status === "in_progress")
  const done = transitions.filter((t) => t.status === "completed")
  const ordered = done.some((d) =>
    started.some((s) => s.id === d.id && Date.parse(d.at) > Date.parse(s.at)),
  )
  return [
    { name: "a: >=2 plan items created", ok: created.length >= 2, detail: `${created.length}` },
    { name: "b: >=1 in_progress transition", ok: started.length >= 1, detail: `${started.length}` },
    { name: "c: >=1 completed transition", ok: done.length >= 1, detail: `${done.length}` },
    { name: "d: completed after in_progress (same item)", ok: ordered, detail: `${ordered}` },
    { name: "e: >=1 subagent event", ok: subagents >= 1, detail: `${subagents}` },
    { name: "f: no home path", ok: !text.includes("/home/"), detail: file },
    { name: "g: no token-shaped string", ok: !tokenShapes.some((re) => re.test(text)), detail: file },
  ]
}

let failed = false
for (const runtime of Object.keys(extractors)) {
  console.log(`== ${runtime}`)
  for (const check of checkRuntime(runtime)) {
    if (!check.ok) failed = true
    console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}  ${check.detail}`)
  }
}
process.exit(failed ? 1 : 0)
