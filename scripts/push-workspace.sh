#!/usr/bin/env bash
# push-workspace.sh
#
# Puts the workspace ROOT under version control and pushes it to the
# langmuir-workspace repo. This is the tenth repo: the docs, sync scripts, Apps
# Script sources and Epicor reference that sit ABOVE the nine service repos.
# The nine are gitignored here; each is tracked by its own repo.
#
#   ./scripts/push-workspace.sh                       # DRY RUN. Shows exactly what would be pushed.
#   ./scripts/push-workspace.sh --apply               # init (if needed), commit, push
#   ./scripts/push-workspace.sh --apply -m "message"
#   ./scripts/push-workspace.sh --apply --personal    # push to <your account>/langmuir-workspace
#   ./scripts/push-workspace.sh --apply --https       # force an HTTPS remote
#   ./scripts/push-workspace.sh --apply --ssh         # force the github-langmuir SSH alias
#
# --personal is for the case where the repo was created under your personal
# account. Push there now, transfer the repo to the org afterwards, then run the
# script again WITHOUT --personal and it repoints origin to the org for you.
#
# Safe to re-run. After the first push it behaves like a normal commit-and-push.
#
# Run this from Terminal. Not from a Cowork sandbox (git against the mount
# leaves stale index.lock files).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_NAME="langmuir-workspace"
WORK_EMAIL="brendan@langmuirsystems.com"

# GH_ORG comes from config.sh once it's swapped in; until then, fall back.
# shellcheck disable=SC1090
[ -f "$SCRIPT_DIR/config.sh" ] && source "$SCRIPT_DIR/config.sh" >/dev/null 2>&1
GH_ORG="${GH_ORG:-langmuirsystems}"
GH_USER="${GH_USER:-BrendanLangmuir}"

APPLY=0
FORCE_PROTO=""
FORCE_OWNER=""
MSG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)    APPLY=1; shift ;;
    --personal) FORCE_OWNER="user"; shift ;;
    --org)      FORCE_OWNER="org"; shift ;;
    --https)    FORCE_PROTO="https"; shift ;;
    --ssh)      FORCE_PROTO="ssh"; shift ;;
    -m)         MSG="${2:-}"; shift 2 ;;
    -h|--help)  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1"; exit 2 ;;
  esac
done

if [ "$FORCE_OWNER" = "user" ]; then OWNER="$GH_USER"; else OWNER="$GH_ORG"; fi

say()  { printf '%s\n' "$*"; }
bar()  { printf '%s\n' "────────────────────────────────────────────────────────────"; }
die()  { printf '\n✗ %s\n' "$*" >&2; exit 1; }

# ── Refuse to run from a Cowork sandbox ───────────────────────────────────────
case "$ROOT" in
  /sessions/*|/mnt/user-data/*)
    die "This looks like a Cowork sandbox mount ($ROOT).
  Run this from Terminal on the machine that owns the folder. Git against the
  mount leaves stale index.lock files behind." ;;
esac

# ── Pick the remote URL ───────────────────────────────────────────────────────
# HTTPS is the target state (identical on macOS and Windows, GitHub Desktop and
# Git Credential Manager handle auth through the browser). But if the Mac still
# has the github-langmuir SSH alias configured and working, use it, because it
# is already authenticated and needs no setup today. The director's Windows
# clone will use HTTPS regardless; remote URLs are per-clone.
HTTPS_URL="https://github.com/$OWNER/$REPO_NAME.git"
SSH_URL="git@github-langmuir:$OWNER/$REPO_NAME.git"

has_ssh_alias() {
  [ -f "$HOME/.ssh/config" ] && grep -qiE '^[[:space:]]*Host([[:space:]]+[^[:space:]]+)*[[:space:]]+github-langmuir([[:space:]]|$)' "$HOME/.ssh/config"
}

case "$FORCE_PROTO" in
  https) REMOTE_URL="$HTTPS_URL"; PROTO_WHY="forced with --https" ;;
  ssh)   REMOTE_URL="$SSH_URL";   PROTO_WHY="forced with --ssh" ;;
  *)
    if has_ssh_alias; then
      REMOTE_URL="$SSH_URL"; PROTO_WHY="github-langmuir alias found in ~/.ssh/config, already authenticated"
    else
      REMOTE_URL="$HTTPS_URL"; PROTO_WHY="no github-langmuir SSH alias found"
    fi ;;
esac
# Env override wins over everything, e.g. REMOTE_URL=... ./scripts/push-workspace.sh
if [ -n "${REMOTE_URL_OVERRIDE:-}" ]; then
  REMOTE_URL="$REMOTE_URL_OVERRIDE"; PROTO_WHY="REMOTE_URL_OVERRIDE set"
fi

bar
say "  Workspace : $ROOT"
say "  Repo      : $OWNER/$REPO_NAME$([ "$OWNER" = "$GH_USER" ] && echo '   ← PERSONAL account, not the org')"
say "  Remote    : $REMOTE_URL"
say "              ($PROTO_WHY)"
say "  Mode      : $([ $APPLY -eq 1 ] && echo 'APPLY' || echo 'DRY RUN')"
bar
say ""

# ── Preconditions ─────────────────────────────────────────────────────────────
[ -f "$ROOT/.gitignore" ] || die "No .gitignore at the workspace root.
  Without it, \`git add -A\` would sweep in the nine service repos, _archive/,
  every node_modules, and any .env file. Refusing to continue."

for must in CLAUDE.md SYSTEM-STATE.md README.md; do
  [ -f "$ROOT/$must" ] || say "  ⚠ $must is missing from the workspace root"
done

command -v git >/dev/null 2>&1 || die "git is not installed."

# ── Stage everything, for real or in a throwaway index ────────────────────────
FRESH=0
if [ -d "$ROOT/.git" ]; then
  GITC=(git -C "$ROOT")
  say "Existing git repo found. Staging changes."
else
  FRESH=1
  if [ $APPLY -eq 1 ]; then
    git -C "$ROOT" init -q || die "git init failed."
    git -C "$ROOT" symbolic-ref HEAD refs/heads/main
    git -C "$ROOT" config user.email "$WORK_EMAIL"
    GITC=(git -C "$ROOT")
    say "Initialized a new repo at the workspace root (branch: main)."
  else
    # Dry run must not create anything. Stage into a temporary index instead,
    # using the real work tree so .gitignore is honoured exactly.
    TMPGIT="$(mktemp -d)"
    trap 'rm -rf "$TMPGIT"' EXIT
    GIT_DIR="$TMPGIT/gitdir" git init -q --bare 2>/dev/null || die "could not create a scratch index"
    GITC=(git --git-dir="$TMPGIT/gitdir" --work-tree="$ROOT")
    say "No repo yet. Previewing with a throwaway index (nothing is written)."
  fi
fi
say ""

"${GITC[@]}" add -A 2>/dev/null

STAGED="$("${GITC[@]}" diff --cached --name-only 2>/dev/null)"

ensure_origin() {
  if "${GITC[@]}" remote get-url origin >/dev/null 2>&1; then
    local current; current="$("${GITC[@]}" remote get-url origin)"
    if [ "$current" != "$REMOTE_URL" ]; then
      say "  origin was $current"
      say "  repointing to $REMOTE_URL"
      "${GITC[@]}" remote set-url origin "$REMOTE_URL"
    fi
  else
    "${GITC[@]}" remote add origin "$REMOTE_URL"
    say "✓ Added origin."
  fi
}

do_push() {
  local branch; branch="$("${GITC[@]}" rev-parse --abbrev-ref HEAD)"
  say ""
  say "Pushing $branch to origin ..."
  if "${GITC[@]}" push -u origin "$branch"; then
    say ""
    bar
    say "  ✓ Pushed. https://github.com/$OWNER/$REPO_NAME"
    say ""
    if [ "$OWNER" = "$GH_USER" ]; then
      say "  ⚠ This is your PERSONAL account. Still to do:"
      say "      1. https://github.com/$GH_USER/$REPO_NAME/settings"
      say "         → Danger Zone → Transfer ownership → $GH_ORG"
      say "      2. ./scripts/push-workspace.sh --apply"
      say "         (no --personal; it repoints origin to the org for you)"
    else
      say "  Next: the director clones THIS repo to C:\\Langmuir, then runs"
      say "        ./scripts/bootstrap.sh in Git Bash to pull the nine services"
      say "        into place. See WINDOWS-SETUP.md."
    fi
    bar
  else
    say ""
    die "Push failed, but the commit is safe on disk. Re-run after fixing the
  remote or your credentials. Nothing was lost."
  fi
}

unpushed_count() {
  local branch; branch="$("${GITC[@]}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
  if "${GITC[@]}" rev-parse --verify -q "origin/$branch" >/dev/null 2>&1; then
    "${GITC[@]}" rev-list --count "origin/$branch..$branch" 2>/dev/null || echo 0
  else
    "${GITC[@]}" rev-list --count "$branch" 2>/dev/null || echo 0
  fi
}

if [ -z "$STAGED" ]; then
  say "No file changes to commit."
  # A previous run may have committed but failed to push. Do not report
  # "up to date" in that case, or the work sits on this laptop forever.
  if [ $FRESH -eq 0 ]; then
    AHEAD="$(unpushed_count)"
    if [ "${AHEAD:-0}" != "0" ]; then
      say "But $AHEAD local commit(s) have never reached the remote."
      if [ $APPLY -eq 0 ]; then
        say ""
        say "Re-run with --apply to push them."
        exit 0
      fi
      ensure_origin
      do_push
      exit 0
    fi
    # Nothing to commit and nothing unpushed, but origin may still point at the
    # old location (e.g. after transferring the repo into the org). Repoint it
    # anyway, otherwise it silently keeps working via GitHub's redirect and the
    # stale URL gets cloned by the next person.
    if [ $APPLY -eq 1 ]; then
      ensure_origin
    elif "${GITC[@]}" remote get-url origin >/dev/null 2>&1; then
      CUR="$("${GITC[@]}" remote get-url origin)"
      [ "$CUR" != "$REMOTE_URL" ] && say "  origin is $CUR — --apply would repoint it to $REMOTE_URL"
    fi
  fi
  say "The workspace root is already up to date with $REMOTE_URL."
  exit 0
fi

# ── Guard 1: nothing that must never be committed ─────────────────────────────
# Note on the inv-history rule: it targets the exported stock-movement DATA
# (inv-history-2026-07-21.json, 890 KB of real transactions). It must NOT catch
# scripts/import-inv-history.sh, which is ordinary tooling and belongs in the
# repo. Hence the (^|/) anchor: the path SEGMENT has to start with inv-history.
FORBIDDEN='(^|/)\.env($|\.)|(^|/)node_modules/|^_archive/|^_to_delete/|(^|/)inv-history[0-9A-Za-z._-]*\.json$|\.pptx$|^Apollo |(^|/)id_(rsa|ed25519)|\.pem$|\.key$|(^|/)\.clasprc\.json$|^(pms|pms-test|ci|hub|procurement|scheduling|tooling|vision|bom)/'
RISKY="$(printf '%s\n' "$STAGED" | grep -vE '(^|/)\.env\.example$' | grep -E "$FORBIDDEN" || true)"

if [ -n "$RISKY" ]; then
  say "✗ These would be committed and must not be:"
  printf '%s\n' "$RISKY" | sed 's/^/    /'
  die "Fix .gitignore before running again. Nothing was committed or pushed."
fi

# ── Guard 2: no secret-looking values in the staged content ───────────────────
# Matches NAME=value / NAME: value, not a bare NAME. The docs list env var names
# in prose and in tables, and those must not trip this.
SECRET_PAT='(EPICOR_(PASS|USER|API_KEY)|DATABASE_URL|ANTHROPIC_API_KEY|MCP_TOKEN|VISION_TOKEN|FEEDBACK_TOKEN|[A-Z_]*PIN)[[:space:]]*[=:][[:space:]]*["'"'"']?[A-Za-z0-9_./+-]{6,}|postgres(ql)?://[^[:space:]]*:[^[:space:]]*@|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}'

if [ "${SKIP_SECRET_SCAN:-0}" = "1" ]; then
  say "  ⚠ SKIP_SECRET_SCAN=1 — credential scan disabled for this run."
  say ""
else
  RAW="$("${GITC[@]}" grep --cached -InE "$SECRET_PAT" 2>/dev/null || true)"
  # Drop code-shaped assignments: a value that is a bare identifier followed by
  # a comma or semicolon is a variable being passed, not a literal secret. The
  # Apps Script that stores Epicor credentials in PropertiesService looks like
  # that, and it is not a leak. A real dotenv line ends at the value with no
  # trailing punctuation, so it still gets flagged.
  # (Deliberately no literal examples in this comment: they would trip the scan.)
  LEAKS="$(printf '%s\n' "$RAW" | grep -vE '[:=][[:space:]]*[A-Za-z_][A-Za-z0-9_]*[,;][[:space:]]*$' | head -20)"
  # grep -c prints 0 AND exits non-zero on no match, so `|| echo 0` would append
  # a second zero and break the arithmetic. Count the strings directly instead.
  nlines() { if [ -z "$1" ]; then echo 0; else printf '%s\n' "$1" | wc -l | tr -d ' '; fi; }
  SKIPPED=$(( $(nlines "$RAW") - $(nlines "$LEAKS") ))
  if [ "$SKIPPED" -gt 0 ]; then
    say "  ($SKIPPED code-shaped match(es) skipped: a variable is being passed, not a literal)"
    say ""
  fi

  if [ -n "$LEAKS" ]; then
    say "✗ Something in the staged content looks like a live credential:"
    printf '%s\n' "$LEAKS" | sed 's/^/    /'
    say ""
    die "Check those lines. If they are false positives (a variable NAME in prose
  rather than a value), re-run with SKIP_SECRET_SCAN=1 set. Nothing was pushed."
  fi
fi

# ── Guard 3: file sizes ───────────────────────────────────────────────────────
TOTAL=0
BIG=""
while IFS= read -r f; do
  [ -f "$ROOT/$f" ] || continue
  sz=$(wc -c < "$ROOT/$f" | tr -d ' ')
  TOTAL=$((TOTAL + sz))
  [ "$sz" -gt 20000000 ] && BIG="$BIG    $f ($((sz / 1000000)) MB)\n"
done <<< "$STAGED"

if [ -n "$BIG" ]; then
  say "✗ Files over 20 MB. GitHub warns at 50 MB and rejects at 100 MB:"
  printf "$BIG"
  die "Add them to .gitignore. Nothing was pushed."
fi

COUNT=$(printf '%s\n' "$STAGED" | wc -l | tr -d ' ')

# ── Show exactly what goes up ─────────────────────────────────────────────────
say "$COUNT file(s), $((TOTAL / 1024)) KB total:"
say ""
printf '%s\n' "$STAGED" | sed 's/^/    /'
say ""
say "Deliberately NOT included (gitignored):"
"${GITC[@]}" status --ignored --porcelain 2>/dev/null | grep '^!!' | sed 's/^!! /    /' | head -20
say ""
say "✓ No .env, no service folders, no _archive, no credentials, no oversized files."
say ""

if [ $APPLY -eq 0 ]; then
  bar
  say "  DRY RUN. Nothing was written, committed or pushed."
  say ""
  say "  If that list looks right:"
  say "      ./scripts/push-workspace.sh --apply"
  bar
  exit 0
fi

# ── Confirm the remote exists before committing ───────────────────────────────
say "Checking $REMOTE_URL ..."
if ! git ls-remote "$REMOTE_URL" >/dev/null 2>&1; then
  say ""

  # The most common miss: the New repository page defaults the Owner dropdown to
  # your personal account, so the repo lands at <you>/langmuir-workspace instead
  # of in the org. Check for that before printing generic advice.
  FOUND_AT=""
  if [ "$OWNER" = "$GH_ORG" ]; then
    PROBE_URLS="${PROBE_URLS:-https://github.com/$GH_USER/$REPO_NAME.git git@github-langmuir:$GH_USER/$REPO_NAME.git}"
    for probe in $PROBE_URLS; do
      if git ls-remote "$probe" >/dev/null 2>&1; then FOUND_AT="$probe"; break; fi
    done
  fi

  if [ -n "$FOUND_AT" ]; then
    say "✗ The repo exists, but under your personal account, not the org:"
    say "      $FOUND_AT"
    say ""
    say "  The New repository page defaults the Owner dropdown to your personal"
    say "  account. Two ways to fix it, both fine:"
    say ""
    say "  A. Push there now and transfer afterwards:"
    say "       ./scripts/push-workspace.sh --apply --personal"
    say "     then move the repo to the org and re-run without --personal;"
    say "     the script repoints origin for you."
    say ""
    say "  B. Transfer it first (keeps anything already pushed):"
    say "       https://github.com/$GH_USER/$REPO_NAME/settings"
    say "       → Danger Zone → Transfer ownership → $GH_ORG"
    say ""
    say "  C. If it is still empty, delete it and recreate with Owner set to"
    say "     $GH_ORG:"
    say "       https://github.com/organizations/$GH_ORG/repositories/new"
    say ""
    die "Then re-run this script. Nothing was committed."
  fi

  say "✗ Cannot reach that repo. Two likely reasons:"
  say ""
  say "  1. It does not exist yet. Create it, empty:"
  say "         https://github.com/organizations/$GH_ORG/repositories/new"
  say "     Name: $REPO_NAME   Visibility: PRIVATE"
  say "     Set the Owner dropdown to $GH_ORG. It defaults to your personal account."
  say "     Do NOT add a README, .gitignore or licence, or the first push conflicts."
  say ""
  say "  2. Your credentials do not cover this URL yet."
  case "$REMOTE_URL" in
    "$HTTPS_URL")
      say "     You are on HTTPS. Try --ssh if the github-langmuir alias still works,"
      say "     or set up a credential helper / personal access token for HTTPS." ;;
    "$SSH_URL")
      say "     You are on SSH via the github-langmuir alias. Try --https, or check"
      say "     that the key has access to the $GH_ORG org." ;;
  esac
  say ""
  die "Nothing was committed. Fix the above and re-run."
fi
say "✓ Remote reachable."
say ""

# ── Commit ────────────────────────────────────────────────────────────────────
if [ -z "$MSG" ]; then
  if [ $FRESH -eq 1 ]; then
    MSG="chore: put the workspace root under version control

The tenth repo: docs, sync scripts, Apps Script sources and Epicor reference
that sit above the nine service repos. The nine are gitignored here and each
is tracked by its own repo."
  else
    MSG="chore: update workspace docs and scripts"
  fi
fi

"${GITC[@]}" commit -q -m "$MSG" || die "commit failed."
say "✓ Committed."

ensure_origin
do_push
