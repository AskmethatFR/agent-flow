#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

if [ "${1:-}" = "precheck" ]; then
  echo "config sources naming step-worker: $(opencode debug config | grep -c '"step-worker"')"
  gate_file="$here/samples/gate-check.jsonl"
  rm -f "$gate_file"
  for attempt in 1 2 3; do
    AF_CAPTURE_FILE="$gate_file" opencode models --standalone > /dev/null 2>&1 && break
  done
  echo "gate check: $(cat "$gate_file" 2>/dev/null | wc -l) records written with AF_CAPTURE_FILE set"
  rm -f "$gate_file"
  exit 0
fi

model="${AF_OPENCODE_MODEL:?set AF_OPENCODE_MODEL to a provider/model id, e.g. anthropic/claude-haiku-5-5}"
prompt='Create exactly two todos "Spike step one" and "Spike step two" with todowrite. Then for each todo in order: update the list so it is in_progress; for step one only, delegate to the subagent step-worker with description "step one work"; then update the list so it is completed. Finally reply DONE.'

rm -f "$here/samples/events.jsonl"
mkdir -p "$here/samples"

AF_CAPTURE_FILE="$here/samples/events.jsonl" timeout 300 opencode run --standalone --auto --format json \
  --title "agent-flow capture spike" --model "$model" "$prompt"
