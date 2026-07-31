#!/usr/bin/env bash
# push-pms.sh — thin shim. The real work lives in push.sh.
#
# Until 2026-07-31 this file hardcoded
#     git remote set-url origin git@github-langmuir:BrendanLangmuir/LangmuirPMS.git
# and ran it on EVERY push. Once the repos moved into the langmuirsystems org,
# that one line silently dragged the pms remote back to the old owner path each
# time anyone ran this script, undoing the repoint. Hence the shim.
#
# Usage is unchanged:
#   ./scripts/push-pms.sh "feat: my change"
exec "$(dirname "$0")/push.sh" pms "${1:-chore: update PMS}"
