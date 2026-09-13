#!/usr/bin/env bash
# PreToolUse on Bash. Refuses `gh pr ready`, `gh pr merge` and any push to
# staging unless every commit the command would ship has a completed CodeRabbit
# review with no open finding. The parsing lives in the gate script so it can be
# exercised directly. Exit 2 blocks the tool call and shows stderr to the agent.
set -euo pipefail
input=$(cat)
command=$(printf '%s' "$input" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')
cwd=$(printf '%s' "$input" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("cwd",""))')
[ -n "$cwd" ] && cd "$cwd"
case "$command" in
  *"gh pr ready"*|*"gh pr merge"*|*"git push"*) ;;
  *) exit 0 ;;
esac
root=$(git rev-parse --show-toplevel)
node "$root/scripts/coderabbit-gate.mjs" guard "$command" 1>&2
