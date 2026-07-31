# Git workflow: two people, one org, two transports

Everything here is post-2026-07-31. If a doc in this repo contradicts this file,
this file is right and that doc is stale.

## 1. Pull before you EDIT, not before you push

Two people push all ten repos. A clone that has not been pulled is not the current
version, and editing it produces a merge conflict at push time at best, and a fix
that gets quietly reverted at worst.

```bash
./scripts/pull-all.sh              # first thing, every session
./scripts/pull-all.sh --check      # report only, change nothing
./scripts/pull-all.sh --autostash  # when you have uncommitted work
```

A Cowork session should ask whether this has been run and **not start editing until
it has**. Pulling after the work is done just relocates the conflict to the most
expensive moment.

## 2. Every push route pulls first

`push.sh` runs `git pull --rebase` between the commit and the push, and **stops** on
a conflict rather than pushing something half-resolved. `push-all.sh`,
`sync-repo.sh push`, `push-pms.sh` and `deploy-scheduling.sh` are all wrappers over
it. `push-workspace.sh` does the same for the workspace root.

Do not add a route that commits and pushes without pulling. That was the old shape
and it is what made a two-person setup unsafe:

- `push.sh` used to go add → commit → push with no fetch, so the second person's
  push failed non-fast-forward, and inside a `push-all.sh` sweep it failed *partway
  through* and left the workspace half-pushed.
- `sync-repo.sh push` additionally exited 0 when there was nothing to commit, which
  silently skipped pushing an earlier committed-but-unpushed change.
- `push-pms.sh` hardcoded a `git remote set-url` to the pre-org path and ran it on
  every push, dragging the pms remote backwards each time.

## 3. The two machines use different transports on purpose

| machine | transport | why |
|---|---|---|
| Director, Windows | HTTPS | GitHub Desktop and Git Credential Manager log in through the browser. Nothing to set up. |
| Brendan, Mac | `github-langmuir` SSH alias | The Keychain credential for `github.com` is `brf1998-code`, a different account with no org access. |

GitHub returns **404, not 403**, for a private repo your credential cannot see, so
the wrong-account case reads as "repository not found" and looks like a transfer or
redirect problem. It is not.

`scripts/config.sh` resolves this per machine, first match wins:

1. `GIT_BASE` exported in the environment
2. `scripts/config.local.sh` (gitignored, per-machine override)
3. a `github-langmuir` Host block in `~/.ssh/config` → SSH
4. otherwise → HTTPS

```bash
source scripts/config.sh && echo "$GIT_TRANSPORT -> $GIT_BASE"
```

Remote URLs are stored per clone, so the two machines differing is correct. **Do not
"standardize" them.**

## 4. Repo names are inconsistently cased. Read the org, not your memory.

`LangmuirPMS` · `LangmuirPMS_Test` · `LangmuirScheduling` · `LangmuirVision` ·
`Langmuir-procurement` · `Langmuir-bom` · `langmuir-tooling` · `langmuir-ci` ·
`langmuirhub` · `langmuir-workspace`

`Langmuir-bom` has a capital L and `config.sh` had it lowercase for a while, so
pushes rode a GitHub rename redirect. If a push prints
`remote: This repository moved`, the name in `config.sh` is wrong. It is not fatal,
which is why it goes unnoticed. The Railway *service* is lowercase `langmuir-bom`;
repo and service names differ on purpose.

## 5. Repo layout

Ten repos: nine services plus `langmuir-workspace`, which is this folder's root and
holds the docs, sync scripts and Apps Script sources. The nine clone into the root
as subfolders and are gitignored there.

`push-all.sh` walks the nine. The root is **not** in it and has its own
`push-workspace.sh`. `repoint-remotes.sh` walks all ten.

Nine stay separate because Railway watches one repo per service and redeploys that
whole service on push. Nine repos means nine independent blast radii. Note that a
doc-only commit still redeploys that service.

## 6. Cowork cannot run git here

The sandbox can read and write files in this folder but cannot run `git commit` or
`git push` against the mount: it has no network, and deletes are blocked, which
breaks git's lock-file dance. So Cowork edits, and the human runs the exact command
Cowork hands over.

Two consequences worth knowing:

- Sandbox commands can leave stray files in the workspace root, and `git add -A`
  will sweep them up. An empty file named `langmuirsystems` reached the repo this
  way. **Read the staged file list that `push-workspace.sh` prints in its dry run.**
  Its guards catch secrets, service folders and oversized files, not junk.
- Never run git from inside the sandbox against this folder. Stale `index.lock`.
