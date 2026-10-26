#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
export AF_SPIKE_DIR="$(cd "$here/.." && pwd)"
export CLAUDE_CODE_ENABLE_TODO_TOOLS=1

prompt='Create exactly two tasks titled "Spike step one" and "Spike step two" with TaskCreate. Then for each task in order: set it to in_progress with TaskUpdate; for step one only, delegate to the subagent step-worker with description "step one work"; then set it to completed with TaskUpdate. Finally reply DONE.'
tools="TaskCreate,TaskUpdate,TaskList,TaskGet,Agent"

rm -f "$here/samples/events.jsonl"
mkdir -p "$here/samples"
cd "$here"

timeout 300 claude -p "$prompt" \
  --settings "$here/settings.json" \
  --setting-sources project \
  --agents "$here/agents.json" \
  --tools "$tools" \
  --allowedTools "$tools" \
  --permission-mode dontAsk \
  --model haiku \
  --max-budget-usd 0.50 \
  --no-session-persistence \
  --output-format json
