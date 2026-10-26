import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { sanitize } from "./shared/recorder.mjs"
import { findLeaks } from "./shared/secrets.mjs"

const root = dirname(fileURLToPath(import.meta.url))

const detectorFixtures = {
  jwt: "e" + "yJhbGciOiJIUzI1NiJ9." + "e" + "yJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk",
  githubFineGrained: "github" + "_pat_" + "A".repeat(30),
  githubServer: "gh" + "s_" + "A".repeat(30),
  stripeLive: "s" + "k_live_" + "A".repeat(24),
  googleKey: "AI" + "za" + "A".repeat(35),
  pem: "-----BEGIN " + "RSA PRIVATE KEY-----",
  urlCredentials: "https" + "://user:pass" + "word@example.test/x",
  dashEncodedHome: "/tmp/x/-home-dev-projects-x",
  tmpClaude: "/tmp/claude-" + "1001/x",
}

const singleRun = {
  "claude-code": (records) => {
    const sessions = new Set(records.map((r) => r.payload?.session_id))
    const ends = records.filter((r) => r.source === "SessionEnd")
    return sessions.size === 1 && ends.length === 1 && records.at(-1)?.source === "SessionEnd"
  },
  opencode: (records) => {
    const ends = records.filter((r) => r.source === "location.shutdown")
    return ends.length === 1 && records.at(-1)?.source === "location.shutdown"
  },
}

const atIsMonotonic = (records) =>
  records.every((r, i) => i === 0 || r.at >= records[i - 1].at)

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
    { name: "f+g: no path or token leak", ok: findLeaks(text).length === 0, detail: findLeaks(text).join(" ") || file },
    {
      name: "h: single run, shutdown/session end is the last record",
      ok: singleRun[runtime](records) && atIsMonotonic(records),
      detail: `${records.length} records`,
    },
  ]
}

const pemBody = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC"
const pemBlock = `-----BEGIN ${"RSA PRIVATE KEY"}-----\n${pemBody}\n${pemBody}\n-----END ${"RSA PRIVATE KEY"}-----`

const checkDetectors = () => [
  ...Object.entries(detectorFixtures).map(([name, fixture]) => ({
    name: `detector flags ${name}`,
    ok: findLeaks(fixture).length > 0,
    detail: "",
  })),
  {
    name: "sanitize redacts a full PEM block, body included",
    ok: !sanitize(`key: ${pemBlock} tail`).includes(pemBody),
    detail: "",
  },
]

let failed = false
const sections = [
  ...Object.keys(extractors).map((runtime) => [runtime, checkRuntime(runtime)]),
  ["detectors", checkDetectors()],
]
for (const [title, checks] of sections) {
  console.log(`== ${title}`)
  for (const check of checks) {
    if (!check.ok) failed = true
    console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}  ${check.detail}`)
  }
}
process.exit(failed ? 1 : 0)
