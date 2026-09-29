#!/usr/bin/env bash
# Records one Claude Code session that drives the site with Playwright MCP while Jev
# decides each step (the repo skill .claude/skills/persona-session). Run from the repo
# root with TYPESAFE_API_KEY set and the sample app served at $BASE (node sample-app/serve.mjs).
set -u
BASE=${BASE:-http://localhost:3000}
OUT=${OUT:-demo/claude-code-session}
SESSION=${SESSION:-runs/session-session-length}
rm -rf "$SESSION"
claude --print --verbose --output-format stream-json \
  --model claude-opus-5-5 --effort medium \
  --mcp-config "$OUT/mcp.json" --strict-mcp-config \
  --allowedTools 'mcp__playwright__*,Read,Write,Bash(node bin/persona-drive.js:*),Bash(npx persona-drive:*),Bash(mkdir:*),Bash(cat:*)' \
  --max-turns 80 --max-budget-usd 4 \
  "Follow the repo skill at .claude/skills/persona-session/SKILL.md exactly (read it first). Persona file: personas/first-time-buyer.yaml, goal id: session-length. Target base URL: $BASE (read-only; never submit a form). Session directory: $SESSION. Use 'node bin/persona-drive.js' in place of 'npx persona-drive'. Save each screenshot you take under $SESSION/. Finish by printing the report." \
  < /dev/null > "$OUT/transcript.jsonl" 2> "$OUT/stderr.log"
echo "exit $?" >> "$OUT/stderr.log"
