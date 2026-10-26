import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { record } from "../shared/recorder.mjs"

const here = dirname(fileURLToPath(import.meta.url))

try {
  const payload = JSON.parse(readFileSync(0, "utf8"))
  record({
    file: join(here, "samples", "events.jsonl"),
    runtime: "claude-code",
    source: payload.hook_event_name,
    kind: "hook",
    payload,
  })
} catch (err) {
  process.stderr.write(`record-hook: ${err?.message ?? err}\n`)
}
process.exit(0)
