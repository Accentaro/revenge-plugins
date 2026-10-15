#!/usr/bin/env bash
# Plans releases against the pool and outputs how many there are.

set -euo pipefail
# shellcheck source=.github/scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

node node_modules/@revenge-mod/plugin-cli/bin/revenge-plugin.js plan-releases --pool "$POOL_CHECKOUT/pool" --out "$PLAN"

echo "count=$(jq 'length' "$PLAN")" >> "$GITHUB_OUTPUT"
