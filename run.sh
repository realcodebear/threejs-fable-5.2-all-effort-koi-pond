#!/bin/bash
# Usage: ./run.sh <run-name>   run names: fable-low fable-medium fable-high fable-xhigh fable-max opus-high astra-high
# Claude: edits + an allowlist of safe shell commands. Codex: its workspace-write sandbox. Screenshots go through the _queue service.
# Same PROMPT.md for every run. Each model runs in its own native harness: no MCP servers, no hooks, no user instructions, no memory.
A="$HOME/koi-arena"; r="$1"; L="$A/_logs/$r"; mkdir -p "$L" "$A/$r"
[ -d "$A/$r/three" ] || { cp -R "$A/_vendor/three" "$A/$r/three"; chmod -R a-w "$A/$r/three"; }
cd "$A/$r" || exit 1
P="$(cat "$A/PROMPT.md")"
CL_FLAGS=(--strict-mcp-config --mcp-config '{"mcpServers":{}}' --disable-slash-commands
  --settings '{"disableAllHooks":true,"claudeMdExcludes":["/Users/you/.claude/CLAUDE.md"],"autoMemoryEnabled":false}'
  --permission-mode acceptEdits
  --allowedTools "Read" "Write" "Edit" "Glob" "Grep" "Bash(../shot.sh:*)" "Bash(ls:*)" "Bash(mkdir:*)" "Bash(cat:*)" "Bash(head:*)" "Bash(tail:*)" "Bash(wc:*)" "Bash(grep:*)" "Bash(node --check:*)"
  --output-format stream-json --verbose)
CX_FLAGS=(--skip-git-repo-check --disable image_generation -c service_tier=priority
  --sandbox workspace-write -c 'sandbox_workspace_write.writable_roots=["/Users/you/koi-arena/_queue"]' --json)
export CODEX_HOME="$A/.codex-home"
case "$r" in
  fable-*) kind=claude; model=claude-fable-5-2; eff="${r#fable-}" ;;
  opus-high) kind=claude; model=claude-opus-5-5; eff=high ;;
  astra-high) kind=codex; model=gpt-6-astra; eff=high ;;
  *) echo "unknown run"; exit 1 ;;
esac
echo "{\"event\":\"start\",\"t\":$(date +%s),\"model\":\"$model\",\"effort\":\"$eff\"}" >> "$L/timing.jsonl"
if [ $kind = claude ]; then claude -p --model $model --effort $eff "${CL_FLAGS[@]}" "$P" < /dev/null 2> "$L/run.err"
else codex exec -m $model -c model_reasoning_effort=$eff "${CX_FLAGS[@]}" "$P" < /dev/null 2> "$L/run.err"; fi | python3 "$A/tsrun.py" "$L/run" > "$L/run.txt"
echo "{\"event\":\"end\",\"t\":$(date +%s)}" >> "$L/timing.jsonl"
