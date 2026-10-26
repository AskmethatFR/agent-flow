#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

if [ "${1:-}" = "precheck" ]; then
  opencode debug config
  opencode debug agents
  opencode models --standalone
  exit 0
fi

model="${AF_OPENCODE_MODEL:?set AF_OPENCODE_MODEL to a provider/model id from: run.sh precheck}"
prompt='Create exactly two todos "Spike step one" and "Spike step two" with todowrite. Then for each todo in order: update the list so it is in_progress; for step one only, delegate to the subagent step-worker with description "step one work"; then update the list so it is completed. Finally reply DONE.'

rm -f "$here/samples/events.jsonl"
mkdir -p "$here/samples"

timeout 300 opencode run --standalone --auto --format json \
  --title "agent-flow capture spike" --model "$model" "$prompt"
