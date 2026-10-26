import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { sanitize } from "./recorder.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const endOfRun = { "claude-code": "SessionEnd", opencode: "location.shutdown" }

const finalize = (runtime, endSource) => {
  const file = join(root, runtime, "samples", "events.jsonl")
  if (!existsSync(file)) return
  const records = readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const end = records.findIndex((r) => r.source === endSource)
  const kept = end === -1 ? records : records.slice(0, end + 1)
  const lines = kept.map((r, i) => JSON.stringify({ ...r, seq: i + 1, payload: sanitize(r.payload) }))
  writeFileSync(file, `${lines.join("\n")}\n`)
  console.log(`${runtime}: ${records.length} -> ${kept.length} records`)
}

for (const [runtime, endSource] of Object.entries(endOfRun)) finalize(runtime, endSource)
