# Moving the repos into the langmuirsystems org

Written 2026-07-30, after the transfer dialog refused to offer the org.

---

## Why GitHub will not let you do it

Your Organizations page says **"Outside collaborator on 2 repositories"** under
`langmuirsystems`. That is the whole problem.

GitHub's rule, verbatim from the docs:

> To transfer repositories to an organization, you must have permission to create
> repositories in the receiving organization.

An outside collaborator has access to specific repositories and **no
organization-level permissions at all**, so there is no org where you can create a
repo. The transfer dialog only lists orgs where you can create repos. Your list is
empty, so all it can offer is "create a new organization." It is not a bug and
there is no hidden setting on your side.

Two things have to be true before the dialog will show `langmuirsystems`:

1. You are a **Member** of the org, not an outside collaborator.
2. The org's member privileges allow members to create **private** repositories.

Both are changed by the org owner. Neither is something you can do yourself.

---

## What the org owner needs to do

Send him this section.

### 1. Change Brendan from outside collaborator to member

- github.com → click the org `langmuirsystems` → **Settings**
- Sidebar, "Access" section → **People**
- **Invite member**, enter Brendan's GitHub username or the email on his account
- Role: **Member** is enough for the transfers. **Owner** if he is meant to keep
  administering the org afterward.

Note: being an outside collaborator does not upgrade automatically. He may need to
be removed as an outside collaborator first, or the invite will simply supersede it.

### 2. Allow the transfer to actually happen

Membership alone is not enough. Once Brendan is a member, `langmuirsystems` appears
in the transfer dropdown but is greyed out and labeled **"(Insufficient permission)"**.
That is the state we hit on 2026-07-30. It means members of this org cannot create
repositories, and transferring a repo in counts as creating one.

There are two ways to clear it. Pick either.

**Option A — make Brendan an org Owner for the duration (recommended).**

- org **Settings** → **People** → find Brendan → Role → **Owner**
- He does the nine transfers
- Set him back to **Member** (or remove him) when they are done

This is targeted. It changes nothing for the other ten people in the org, and it is
reversible in two clicks. Owners can always create repositories regardless of the
member-privilege setting.

**Option B — let members create private repositories.**

- org **Settings** → sidebar "Access" → **Member privileges**
- Under **Repository creation**, check **Private**

This works, but it grants every member of the org the ability to create private
repos, and it stays on until someone turns it back off. If you use this, turn it off
again after the transfers.

If **Repository creation** is greyed out in Member privileges, the org sits under an
enterprise account and the policy is locked one level up. In that case only an
enterprise owner can change it, and Option A is the faster path.

### 3. 2FA

The org badge says **2FA required**. Brendan's account must have two-factor
authentication turned on before the member invite can be accepted. He almost
certainly already does, since outside collaborators are held to the same
requirement, but confirm rather than debug it later.

### 4. After the transfers, set permissions

Once the repos are in the org, the owner has admin on all of them automatically.
For anything more granular, create a team and give it Admin on the nine repos, so
access is managed in one place instead of per-repo.

---

## Nothing restarts. This is the part worth being sure about.

The concern was breaking live services. Transferring a repo does not touch Railway
at all, and specifically:

- **Railway deploys on a push webhook.** A repository transfer is not a push. No
  build is triggered, no container is recycled, nothing restarts.
- **The running service keeps serving the commit it already has.** This is
  confirmed by Railway's own support threads: after a repo transfer, the reported
  symptom was a service "stuck on 4-day-old commit" while continuing to run
  normally. Stuck, not down.
- **Local clones keep working.** GitHub sets up a permanent redirect from
  `BrendanLangmuir/<repo>` to the new location, so fetch, pull, and push all
  continue to resolve.
- **Webhooks, secrets, and deploy keys survive the transfer.** GitHub's docs:
  "If the transferred repository contains webhooks, services, secrets, or deploy
  keys, they will remain associated after the transfer is complete."

What **does** break is future auto-deploys, because the Railway GitHub App is
installed against an account or org and does not automatically follow a repo into a
new org. The failure mode is "I pushed and nothing happened", not an outage. The
fix is in the next section.

---

## Do one repo first as a canary

Do not transfer all nine in a row and then start checking. Transfer
**`LangmuirPMS_Test`** first. It is the staging clone, nothing on the floor depends
on it, and it exercises the identical Railway path as everything else.

1. Transfer `LangmuirPMS_Test` to the org.
2. Confirm `langmuir-pms-test` on Railway is still running. It will be.
3. Push a trivial commit to it.
4. If Railway builds it, the GitHub App is fine and you can do the other eight.
5. If Railway does **not** build it, work through the reconnect steps below once,
   then do the other eight knowing the fix.

Leave `LangmuirPMS` for last. It is the center of gravity, and by the time you get
to it you will have done the same operation eight times.

---

## If auto-deploy stops after a transfer

This is the known failure and it has a known fix.

1. **Authorize the Railway GitHub App on the org.**
   github.com → org **Settings** → sidebar **GitHub Apps** (under "Third-party
   Access" / "Integrations") → find Railway → **Configure** → grant it access to
   the nine repositories. Only the org owner can do this.

2. **Disconnect and reconnect the repo on the Railway service.**
   Railway → the service → **Settings** → **Source** → disconnect, then connect the
   repo again from the org. Re-select the branch.

3. **If the repo does not appear in Railway's picker**, Railway's copy of your
   GitHub install data is stale. Wait a few minutes and retry the reconnect.
   Railway support has confirmed this specific stale-install-data case and that a
   retry after the sync catches up is the resolution.

4. **In the meantime, you are not stuck.** `railway up` from the CLI deploys
   without touching the GitHub connection, and the Command Palette has a
   **Deploy Latest Commit** option. Auto-deploy being down never means you cannot
   ship.

Do not delete and recreate a Railway service to fix this. Recreating is what would
actually cause an outage, and it would lose the environment variables.

---

## Then, and only then

Once all nine are in the org and Railway is deploying again, come back to
`TURNOVER-PLAN.md` Phase 2 and switch the remotes off the `github-langmuir` SSH
alias:

```bash
cd ~/Documents/Claude/Projects/Langmuir\ Production\ Management\ System
mv scripts/config.sh scripts/config.sh.pre-turnover
mv scripts/config.sh.new scripts/config.sh
# edit GH_ORG at the top -> langmuirsystems
./scripts/repoint-remotes.sh          # dry run
./scripts/repoint-remotes.sh --apply
./scripts/status.sh
```

Sources:

- [Transferring a repository — GitHub Docs](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository)
- [Restricting repository creation in your organization — GitHub Docs](https://docs.github.com/en/organizations/managing-organization-settings/restricting-repository-creation-in-your-organization)
- [GitHub auto-deploy not triggering after repo transfer — Railway Central Station](https://station.railway.com/questions/git-hub-auto-deploy-not-triggering-after-9f895a18)
- [Org repo not selectable after transfer — Railway Central Station](https://station.railway.com/feedback/org-repo-not-selectable-after-transfer-f57c2e6b)
- [Controlling GitHub Autodeploys — Railway Docs](https://docs.railway.com/deployments/github-autodeploys)
