import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const home = homedir()
const SECRET_KEY = /token|secret|key|auth|cookie|password/i
const PATH_KEYS = new Set(["transcript_path", "agent_transcript_path"])
const MAX_STRING = 200
const tokenShape = new RegExp(
  "\\b(?:" + "s" + "k-|gh" + "p_|gh" + "o_|xo" + "x[bp]-)[A-Za-z0-9_-]{16,}",
  "g",
)

const scrubString = (value) => {
  const scrubbed = value
    .split(repoRoot)
    .join("<repo>")
    .split(home)
    .join("~")
    .replace(tokenShape, "<redacted>")
  return scrubbed.length > MAX_STRING ? `${scrubbed.slice(0, MAX_STRING)}…[truncated]` : scrubbed
}

export const sanitize = (value, key = "") => {
  if (typeof value === "string") {
    return PATH_KEYS.has(key) ? basename(value) : scrubString(value)
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item))
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !SECRET_KEY.test(k))
        .map(([k, v]) => [k, sanitize(v, k)]),
    )
  }
  return value
}

const nextSeq = (file) =>
  existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).length + 1 : 1

export const record = ({ file, runtime, source, kind, payload }) => {
  mkdirSync(dirname(file), { recursive: true })
  const envelope = {
    seq: nextSeq(file),
    at: new Date().toISOString(),
    runtime,
    source,
    kind,
    payload: sanitize(payload),
  }
  appendFileSync(file, `${JSON.stringify(envelope)}\n`)
}

export const shapeOf = (value, prefix = "", depth = 0) => {
  if (!value || typeof value !== "object" || depth >= 3) return []
  return Object.entries(value).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k
    return [path, ...shapeOf(v, path, depth + 1)]
  })
}
