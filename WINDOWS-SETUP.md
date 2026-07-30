# Setting Up on Windows

For whoever is taking over the Langmuir production systems. This assumes you are
on Windows and have not used git before. Follow it top to bottom. It should take
about an hour, most of it waiting on installers.

If something here does not match what you see on screen, stop and ask rather than
improvising. Several of these systems write to live inventory.

---

## What you are getting

Ten repositories on GitHub, all under the `langmuirsystems` organization.

One of them (`langmuir-workspace`) is the folder everything else sits inside. It
holds the documentation, the helper scripts, the Epicor reference docs, and the
Google Apps Script sources. It does not run anything by itself.

The other nine are the actual applications. Each one deploys to its own service
on Railway. When you push a change to one of them, Railway rebuilds and restarts
that one service, usually in under two minutes. Nothing else is affected. That
separation is on purpose.

| Folder | Repository | What it is |
|---|---|---|
| `pms` | LangmuirPMS | The main operator system. Picker, receiving, shipping, cycle count, KPI board, line boards. **Start here. Most work happens in this one.** |
| `pms-test` | LangmuirPMS_Test | Staging copy of pms. Lags behind. |
| `ci` | langmuir-ci | Continuous improvement and support intake boards. |
| `hub` | langmuirhub | The landing page that links to every tool. |
| `procurement` | Langmuir-procurement | Supply chain decision support. |
| `scheduling` | LangmuirScheduling | Production scheduling. |
| `tooling` | langmuir-tooling | Tooling request board. |
| `vision` | LangmuirVision | Part identification by photo. |
| `bom` | langmuir-bom | BOM manager, seeded from Epicor. |

Read `SYSTEM-STATE.md` in the workspace folder before you change anything. It
tells you which repo actually serves a given feature. Features have moved between
repos over time and the old copies are still on disk in `_archive`, where editing
them does nothing.

---

## Step 1. Install five things

Install in this order. Accept the defaults unless noted.

1. **Git for Windows** from https://git-scm.com/download/win
   During install, when it asks about line endings, pick **"Checkout as-is, commit
   Unix-style line endings"**. This matters, see Step 3.

2. **GitHub Desktop** from https://desktop.github.com
   Sign in with your GitHub account when it opens. This is your daily driver for
   pulling and pushing.

3. **Node.js LTS** from https://nodejs.org
   Take the LTS version, not "Current". Needed to run any of the apps locally.

4. **Visual Studio Code** from https://code.visualstudio.com
   Optional if you have another editor you like, but the rest of this assumes it.

5. **Claude desktop app** from https://claude.ai/download
   This is what runs Cowork against the folder.

Check they all landed. Open **Git Bash** (Start menu, type "git bash") and run:

```bash
git --version
node --version
npm --version
```

Three version numbers means you are good.

---

## Step 2. Confirm you have access

Before cloning anything, confirm with Brendan that all of these are done. Cloning
will fail in confusing ways if the GitHub invite has not been accepted.

- [ ] GitHub organization invite accepted (check your email, and
      https://github.com/settings/organizations)
- [ ] You can see all ten repositories at https://github.com/orgs/langmuirsystems/repositories
- [ ] Railway project invite accepted
- [ ] Epicor API account created for you, or the shared service account handed over
- [ ] Google account added to the `pms-locations` Apps Script and the Locations sheet
- [ ] Your IP address added to the shop allowlist (`ALLOWED_IPS`), if you will
      ever work from outside the building
- [ ] You have the PIN codes (picker, manager, purchaser, queue, BOM)

---

## Step 3. Three git settings, once

Windows git has two defaults that cause problems with repos that were created on
a Mac. Set these once in **Git Bash** and forget about them.

```bash
git config --global core.autocrlf input
git config --global core.longpaths true
git config --global init.defaultBranch main
```

What they do, briefly:

- `core.autocrlf input` stops Windows from rewriting every line ending on
  checkout. Without this, your very first commit will show every line of every
  file as changed, and nobody will be able to review it.
- `core.longpaths true` lets git handle file paths longer than 260 characters.
  Node projects blow past that inside `node_modules` regularly.
- `init.defaultBranch main` matches what these repos use.

---

## Step 4. Get the workspace onto your machine

**Use `C:\Langmuir` as the location.** Not Documents, not OneDrive, not your
desktop. Short path, no spaces, and not inside a folder that syncs to the cloud.
OneDrive in particular will fight with git over file locks and corrupt things.

In GitHub Desktop: **File → Clone repository → GitHub.com** tab, find
`langmuir-workspace`, set **Local path** to `C:\Langmuir`, click Clone.

That gives you the docs and the scripts. Now the nine app repos need to go inside
that folder, each with a specific folder name (they do not all match the repo
name).

### The fast way, one command

Open **Git Bash**, and run:

```bash
cd /c/Langmuir
./scripts/bootstrap.sh
```

That reads `scripts/config.sh` and clones all nine into the right folder names.
It skips anything already there, so it is safe to run again. A browser window may
pop up asking you to sign in to GitHub. That is Git Credential Manager. Sign in
and it will remember you.

Then add each one to GitHub Desktop so you can use the buttons: **File → Add
local repository**, point it at `C:\Langmuir\pms`, repeat for the other eight.
Tedious once, then done forever.

### The manual way, if the script gives you trouble

Clone each one in GitHub Desktop and set the local path by hand. The folder name
must match the left column exactly, or the scripts will not find it.

| Set local path to | Repository |
|---|---|
| `C:\Langmuir\pms` | LangmuirPMS |
| `C:\Langmuir\pms-test` | LangmuirPMS_Test |
| `C:\Langmuir\ci` | langmuir-ci |
| `C:\Langmuir\hub` | langmuirhub |
| `C:\Langmuir\procurement` | Langmuir-procurement |
| `C:\Langmuir\scheduling` | LangmuirScheduling |
| `C:\Langmuir\tooling` | langmuir-tooling |
| `C:\Langmuir\vision` | LangmuirVision |
| `C:\Langmuir\bom` | langmuir-bom |

---

## Step 5. Google Apps Script

Two scripts are not in git. They live in Google and are managed with a tool
called clasp. One of them (`pms-locations`) is the **live inventory ledger**, so
be careful with it.

In Git Bash:

```bash
npm install -g @google/clasp
clasp login
```

That opens a browser to authorize your Google account. Then:

```bash
cd /c/Langmuir
./scripts/sync-gscript.sh tooling-sheet pull
./scripts/sync-gscript.sh pms-locations pull
```

Pushing a script makes it live immediately. There is no separate deploy step and
no undo. Practice on `tooling-sheet` first.

---

## Step 6. Point Cowork at the folder

Open the Claude desktop app, start a Cowork task, and connect `C:\Langmuir` as a
folder. Cowork reads `CLAUDE.md` at the root automatically, which is what tells it
how this workspace is laid out and what the rules are.

Sanity check: ask it "which repo serves the KPI board?" It should answer `pms`,
at `/kpi`, and mention that the old standalone KPI repo is retired. If it says
anything else, it is not reading `CLAUDE.md` and the folder is not connected
properly.

---

## Step 7. The daily loop

This is the whole workflow.

1. **Pull first.** Open GitHub Desktop, pick the repo, click **Fetch origin**,
   then **Pull origin** if it offers. Do this before you start, every time. Not
   pulling is how you end up with a merge conflict.
2. **Make the change.** Either edit in VS Code, or ask Cowork to make the change
   and review what it did.
3. **Review the diff.** GitHub Desktop shows you every changed line on the
   Changes tab. Read it. If you see files you did not expect (especially anything
   ending in `.env`), stop.
4. **Commit.** Write a short message saying what changed. Click **Commit to main**.
5. **Push.** Click **Push origin**.
6. **Watch it deploy.** Open Railway, find the service for that repo, and watch
   the build. Two minutes or so. If the build fails, the old version stays live,
   so a failed build is not an outage.
7. **Check the live page.**

---

## Windows-specific things that will bite you

**Do not put the folder in OneDrive or Documents-that-syncs.** It will lock files
mid-operation and git will report corruption that is not real corruption.

**Do not use `git status` or commit from inside Cowork's sandbox.** Cowork can
read and edit files fine, but git operations against the mounted folder leave
behind stale `index.lock` files. Let Cowork make the edits, then commit and push
yourself in GitHub Desktop.

**Antivirus slows git and npm down a lot.** If `npm install` takes ten minutes,
adding `C:\Langmuir` as a Windows Defender exclusion usually fixes it.

**Paths with spaces.** `C:\Langmuir` avoids this, which is why it is the
recommendation. If you ever do need to type a path with a space in Git Bash, wrap
it in quotes.

**Git Bash uses forward slashes.** `C:\Langmuir` is `/c/Langmuir` in Git Bash.
Both refer to the same folder.

---

## Secrets: they are not in GitHub, and that is deliberate

Every one of these apps reads its configuration from environment variables:
database connection strings, Epicor credentials, PIN codes, API keys. None of
that is in the repositories. It lives in **Railway → the service → Variables**.

If you want to run an app on your own machine, create a file called `.env` in
that app's folder and copy the values out of Railway. Some repos have a
`.env.example` showing the shape. **Never commit a `.env` file.** They are in
`.gitignore` already, so git will not offer to. Do not override that.

Same rule for Apps Script: secrets go in Project Settings → Script Properties,
never in the code.

---

## Running an app locally

```bash
cd /c/Langmuir/pms
npm install
npm start
```

Then open http://localhost:3000 (check `PORT` in the `.env` if that does not
work). Some features will not work locally without a real `DATABASE_URL` and
Epicor credentials.

---

## When something breaks

**A push is rejected.** Someone else pushed first. In GitHub Desktop, Pull, then
Push again.

**A merge conflict.** GitHub Desktop will name the files. Open them in VS Code,
which marks the conflicting sections. Pick which version to keep, save, commit. If
you are not sure, ask before resolving.

**A Railway build fails.** Open the build log in Railway. It is usually a syntax
error in the last commit. The old version is still live, so there is no rush.

**A page loads but shows no data.** Check the shop IP allowlist first
(`ALLOWED_IPS`), then whether the Epicor credentials in Railway are still valid.
Epicor passwords expire.

**You changed something and nothing happened.** You are probably in the wrong
repo. Check `SYSTEM-STATE.md`. Features have moved between repos and the old
copies still exist in `_archive`, where editing them changes nothing.

---

## If you only remember four things

1. `pms` is the main system. Check `SYSTEM-STATE.md` before assuming otherwise.
2. Pull before you start. Every time.
3. Secrets live in Railway, never in git.
4. `pms-locations` in Apps Script is the live inventory ledger. Pushing to it is
   immediate and has no undo.
