#!/usr/bin/env bash
# PreToolUse on Bash. Refuses `gh pr ready`, `gh pr merge` and any push to
# staging unless the commit being shipped has a completed CodeRabbit review
# with no open finding. Exit 2 blocks the tool call and shows stderr to the agent.
set -euo pipefail
input=$(cat)
command=$(printf '%s' "$input" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')
cwd=$(printf '%s' "$input" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("cwd",""))')
[ -n "$cwd" ] && cd "$cwd"

sha=""
if [[ "$command" =~ gh[[:space:]]+pr[[:space:]]+(ready|merge)([[:space:]]+([0-9]+|https?://[^[:space:]]+))? ]]; then
  ref="${BASH_REMATCH[3]:-}"
  if [ -n "$ref" ]; then
    sha=$(gh pr view "$ref" --json headRefOid --jq .headRefOid)
  else
    sha=$(git rev-parse HEAD)
  fi
elif [[ "$command" =~ git[[:space:]]+push([^\;\&\|]*) ]]; then
  args="${BASH_REMATCH[1]}"
  if [[ "$args" =~ ([^[:space:]:]+):staging([[:space:]]|$) ]]; then
    sha=$(git rev-parse "${BASH_REMATCH[1]}")
  elif [[ "$args" =~ [[:space:]]staging([[:space:]]|$) ]]; then
    sha=$(git rev-parse staging)
  elif [[ "$(git rev-parse --abbrev-ref HEAD)" == "staging" ]] && [[ ! "$args" =~ : ]]; then
    sha=$(git rev-parse HEAD)
  fi
fi

[ -z "$sha" ] && exit 0
root=$(git rev-parse --show-toplevel)
node "$root/scripts/coderabbit-gate.mjs" check "$sha" 1>&2
