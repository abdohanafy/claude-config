---
name: implement-e2e
description: >-
  Implement a set of tickets end to end, unattended: pick the unblocked ones, share them between the
  configured implementer lanes (claude, copilot, codex, ...), each ticket in its own reusable git
  worktree, up to 3 in parallel, review, gate, commit and land each on the current branch or through
  a pull request, then report. Recovers a run that died. Use when the user invokes /implement-e2e or
  asks to "implement these tickets end to end", "run the queue unattended", or to implement tickets
  through delegates without describing the delegation each time.
argument-hint: "<tickets|spec> [lanes <a[:share],b[:share]>] [lane <name>] [copilot|codex|cursor|grok|kimi|opencode|claude] [parallel <n>] [pr [merge]] [pick] [push]"
---

# Implement end to end

You are the **orchestrator** for a whole run. You never write the feature code yourself: implementers
do, in separate worktrees. You choose tickets, write briefs, dispatch, review, gate, commit and land.

The owner may be at work or asleep. **Finish the run without asking anything** unless a stop
condition below is hit. A problem with one ticket parks that ticket; it never stops the run.

A file that launches this skill for an unattended system may add policy on top: who may merge,
labels, a report file. Policy from the launcher wins over this skill. The repo's own instruction
files (`CLAUDE.md`, `AGENTS.md`) win over both.

## 1. Parse the arguments

From `$ARGUMENTS` and the user's message (plain words are fine, e.g. "only copilot, 2 at a time"):

| Setting | Default | Override |
|---|---|---|
| Tickets | Open issues labelled `ready-for-agent` in the repo's tracker | Issue numbers, a spec/PRD issue, a `.scratch/<feature>/issues/` folder, or a plan file |
| Lanes | Every implementing lane in the lane map, equal shares (step 1c) | `lanes <a,b>`: only these. `lanes <a:80,b:20>`: with these shares. `lane <name>` or a bare lane name: only that one |
| Implementer | Each lane's `implementer` | An implementer name (`claude`, `copilot`, `codex`, `cursor`, `grok`, `kimi`, `opencode`): every ticket goes to that implementer |
| Parallel | 3, across all lanes | `parallel <n>` / "n at a time" |
| Landing | Local merge onto the current branch | `pr`: one pull request per ticket, left open. `pr merge`: also merge it once its required checks pass |
| Picker | off | `pick`: show lanes as cards (below) |
| Push | off | `push`: push the branch and close issues at the end. Ignored with `pr` |

Read the lane map once:

```bash
node ~/.claude/skills/delegate-setup/scripts/config.mjs load --cwd "$PWD"
```

- A lane is dispatched through the `*-delegate` skill of its `implementer`, with `--lane <name>`.
- Implementer named without a lane → use that implementer's `*-delegate` skill **without** `--lane`
  (relays reject a lane bound to another implementer).
- A named lane that is missing → leave it out and note it in the report. None of the named lanes
  exists → fall back to `implement`.
- **`pick`** → one `AskUserQuestion` with up to 4 options, one card per lane (label = lane name,
  description = implementer, model, effort), first option "All lanes, shared (Recommended)". This is
  the only question allowed in a run, and only when asked for.

## 1b. Load the skills this one composes

This skill owns no implementation or delegation rules of its own. It combines two kinds of skill,
read live so their updates flow through:

1. **The delegate skills.** Load the `*-delegate` skill of every lane in use with the Skill tool
   (e.g. `claude-delegate`, `copilot-delegate`). Its rules govern the brief, the dispatch, the review
   and the landing for the tickets on that lane.
2. **Matt Pocock's `implement` skill.** It is user-only (`disable-model-invocation`), so the Skill
   tool cannot load it. Read it from disk instead. Find the install path in
   `~/.claude/plugins/installed_plugins.json` under `mattpocock-skills@claude-plugins-official`
   (`installPath`), then read `<installPath>/skills/engineering/implement/SKILL.md` and the `tdd`
   skill it points to (`<installPath>/skills/engineering/tdd/SKILL.md`, `tests.md`, `mocking.md`).
   Missing → stop at preflight and say so.

`implement` describes one worker doing everything. In a delegated run its steps are split:

| `implement` step | Who does it here |
|---|---|
| Implement the spec or tickets, using `/tdd` at pre-agreed seams | The implementer. The delegate relays turn off skills in the child, so paste the `tdd` files' text into the brief |
| Run the typecheck and single test files regularly, the full suite once at the end | The implementer, then the orchestrator again when it reviews |
| Use `/code-review` once done | The orchestrator: the `mattpocock-skills:code-review` skill, against the ticket |
| Commit to the current branch | The orchestrator, after review (the delegate skills forbid the implementer from committing) |

Whatever `implement` says when read wins over this table if they differ. Say so in the report.

## 1c. Share the tickets between the lanes

One lane never carries a whole run when more than one can take the work.

**Which lanes take tickets.** From the lanes chosen in step 1, keep a lane when all of these hold:

- it is not `readOnly`, and its name is not for another kind of work (`debate`, `review`,
  `research`, `plan`);
- its implementer CLI is installed and logged in (the delegate skill's prerequisites).

Leave the others out of this run and name them in the report.

**Which lane gets a ticket.** Decide when you dispatch it, in this order:

1. **Fit.** A lane named for a kind of work (`tests`, `ui`, `docs`, ...) takes the tickets of that
   kind and no others. When the general lanes differ in strength (model or effort), a ticket in an
   area the repo's instruction files tell you to be careful with goes to the strongest one.
2. **Shares.** Otherwise the lane that is furthest below its share: the lowest `tickets / share`
   in the tally below. On a tie, the lane with the higher share, then the order the lanes were
   given in.

**Shares.** Every lane has a share. `lanes implement:80,implement-copilot:20` sets them. They are
relative numbers and need not add up to 100. No numbers → every lane gets the same share. A lane
with share `0` is a backup: it takes tickets only when every lane with a share is out.

**The tally.** A single run is too small to hit a split like 80 to 20, so the count runs across
runs, in `$(git rev-parse --git-common-dir)/implement-e2e/lane-tally.json`:

```json
{ "shares": { "implement": 80, "implement-copilot": 20 },
  "tickets": { "implement": 8, "implement-copilot": 2 } }
```

- Read it at preflight. Missing, or its `shares` differ from this run's → start every lane at 0.
- Add one to a lane when you dispatch a ticket to it, and write the file. A ticket placed by fit
  counts too.
- A ticket dispatched while a lane with a share is out is not counted, and a ticket moved off a
  lane that dropped out comes off that lane's count. A lane that comes back is owed no backlog.

**When a lane drops out.** A lane is out for the rest of the run when its implementer cannot start
or stops on a usage limit. Share its unfinished tickets between the lanes still in, by the same
rule. A ticket moved this way starts again from `BASE`, and the move does not count as a rework
round. If no lane is left: stop dispatching, finish what is in flight, leave the other tickets as
they are for the next run to recover, end with phase `stopped`, and say in the report when the limit
resets if you know.

Rework always goes back to the session that wrote the code, never to another lane.

## 2. Preflight (the only place to stop early)

Stop and tell the user, before dispatching anything, when:

- the main working tree is dirty, or HEAD is detached;
- no lane is left after step 1c;
- `gh auth status` fails while tickets come from GitHub, or `pr` was given;
- no ticket is ready and nothing needs recovery.

Otherwise record `BASE` = current branch and its commit, and start the progress file at
`$(git rev-parse --git-common-dir)/implement-e2e/<YYYY-MM-DD-HHMM>.md` (inside `.git`, never committed,
survives a sleeping owner). Format: the delegate skill's `references/multi-task-queues.md`.

### Recover an earlier run

A run can die halfway: a crash, a usage limit, a restart. Before you take new tickets, read the
old `live.json`, the newest progress file and `git worktree list`. If the old run has tickets that
are neither `landed`, `parked` nor `out`, take them first, each in this order:

1. An open pull request exists for it → continue from the checks step of the landing.
2. Its worktree holds work → run the gates and the review on what is there. Send what is missing
   back to the same implementer session. This counts as one rework round.
3. The session cannot be resumed, or the worktree is broken or empty → reset the worktree to
   `BASE` and dispatch the ticket again. It may go to another lane.

A worktree an earlier run left outside the slot paths (step 4) is used for its own ticket as it
is, then removed once that ticket lands.

Recovered tickets count toward any ticket cap. Say in the report that the earlier run died, at
which phase, and what you did with each ticket.

### Live board file

Beside the progress file, keep `$(git rev-parse --git-common-dir)/implement-e2e/live.json`. The
`e2e-board` mod draws it as a live pane. Rewrite the whole file (Write tool, never append) at every
transition: run start, each ticket state change, each orchestrator phase change, run end. Shape:

```json
{
  "version": 1, "runId": "2026-10-03-2215", "repo": "<repo name>",
  "base": { "branch": "main", "commit": "<sha>" },
  "lane": "implement", "implementer": "claude", "model": "claude-sonnet-5-5", "effort": "high",
  "lanes": [
    { "name": "implement", "implementer": "claude", "model": "claude-sonnet-5-5", "effort": "high", "share": 80, "tickets": 2, "out": null },
    { "name": "implement-copilot", "implementer": "copilot", "model": "claude-sonnet-5.5", "effort": "high", "share": 20, "tickets": 1, "out": "usage limit, resets 16:30" }
  ],
  "parallel": 3, "landing": "local", "push": false,
  "startedAt": "<ISO>", "updatedAt": "<ISO, now>",
  "orchestrator": { "phase": "waiting", "doing": "waiting on #31, #33; #34 next" },
  "tickets": [
    { "id": "#31", "title": "...", "state": "running", "blockedBy": [], "branch": "e2e/31-zoom",
      "worktree": "...", "lane": "implement", "implementer": "claude", "sessionId": "...",
      "startedAt": "<ISO>", "rework": 0, "commit": null, "pr": null,
      "note": "short reason when parked or out" }
  ],
  "log": [{ "at": "<ISO>", "text": "landed #30 as abc1234" }]
}
```

- In `lanes`, `tickets` is this run's count for the lane; the count across runs is in the tally.
- The top-level `lane`, `implementer`, `model` and `effort` describe the first lane in `lanes`. They
  stay for readers that know only one lane. Every ticket carries its own `lane` and `implementer`
  from the moment it is dispatched.
- `phase`: `preflight`, `dispatching`, `waiting`, `reviewing`, `landing`, `closing`, `done`, `stopped`.
- Ticket `state`: `waiting`, `ready`, `running`, `reviewing`, `rework`, `landing`, `landed`, `parked`, `out`.
- `landing`: `local`, `pr` or `pr-merge`.
- `doing` is one plain sentence a person glancing at the pane understands. Keep `log` to the last 30
  lines. End every run with phase `done` or `stopped` so the board stops animating.
- The board treats a run with no `updatedAt` change for 3 hours as dead (a crashed session) and stops
  animating it. A launcher may start a new run over it. The heartbeat in step 4 is what keeps a
  slow but healthy run from looking dead.

## 3. Build the frontier

Fetch every ticket and its blocking edges: GitHub native dependencies
(`issue_dependencies_summary.blocked_by`), a `Blocked by: #n` line, or the "Blocked by" section of a
local ticket file. Follow the repo's `docs/agents/issue-tracker.md` when it exists.

- **Ready**: every blocker is closed or landed in this run.
- **Waiting**: has a blocker still in the queue. With `pr` and no `merge`, a ticket whose blocker
  only has an open pull request stays waiting; list it in the report.
- **Out**: blocked by something outside the queue that is still open, or it already has an open
  pull request from someone else. Skip it, list it in the report.

Two ready tickets that will obviously edit the same files (same module, same config, same
migration) run one after the other, not side by side. A dependency cycle → those tickets are out.

## 4. Dispatch, one worktree per ticket

### Worktree slots

Installing dependencies is the slow part of a dispatch, so worktrees are reused. There are up to
`parallel` **slots**, at `<repo>/../<repo-name>.worktrees/slot-<n>`. A slot is a worktree that
stays after its ticket lands, with its installed dependencies.

Take a free slot for each ready ticket, while fewer than `parallel` are in flight:

```bash
# first use of the slot
git worktree add --detach "<repo>/../<repo-name>.worktrees/slot-<n>" "$BASE"
# every use, in the slot
git status --porcelain        # must be empty, otherwise the slot is not free
git clean -fd                 # untracked files only; ignored ones (installed dependencies) stay
git switch -c "<branch>" "$BASE"
```

Branch name: the repo's own rule when its instruction files state one, otherwise
`e2e/<ticket>-<slug>`.

**Install only when the lockfile changed.** Hash the lockfile (`package-lock.json` or the repo's
equivalent) and compare it with the hash stored in the slot's own git directory
(`$(git rev-parse --git-dir)/e2e-deps-hash`, run inside the slot):

- same hash → skip the install;
- different or missing → install from the lockfile (`npm ci` or the repo's equivalent), then store
  the new hash. Start the install in the background and write the brief while it runs.

Ignored build output from the slot's last ticket is still there, so run the repo's build step
before the gates when it has one. Never trust a build you did not make for this ticket.

When you free a slot (step 5): if the ticket's diff touched a lockfile or a package manifest, delete
the stored hash so the next ticket installs again.

### The brief

Write the brief per the delegate skill, and add to every brief:

- the ticket text in full, plus decisions from tickets already landed in this run that it relies on;
- the implementer's part of `implement` (step 1b table), in its own words, and the `tdd` skill text;
- the project's real gate commands (from `CLAUDE.md`, `AGENTS.md`, `package.json`);
- "Do not commit. Do not ask questions: if something is ambiguous, pick the option most consistent
  with the code and the ticket, and list the choice under `Decisions` in your final message.";

Dispatch with `--cd <slot>` and the ticket's lane flag, **in the background**
(`run_in_background: true`). Do not poll; you are woken when a relay exits.

**No wait is open-ended.** Pass `--timeout` on every dispatch: the lane's own `timeout` when it has
one, otherwise `2h`. A relay that ends on its time limit goes back to the same session with "carry
on from where you stopped", and that counts as a rework round.

**Heartbeat.** A launcher reads `updatedAt` to tell a live run from a dead one, and a long wait
changes no ticket state. So whenever something is in flight, keep one 30 minute timer running in
the background (a background `sleep`, nothing else). When it wakes you, rewrite the board with a
fresh `updatedAt` and a `doing` line that says how long each running ticket has been out, then start
the next timer. Do nothing else on a heartbeat. Stop the timers when the run ends.

## 5. Review and land, as each one finishes

1. Read `result.json`. Re-run the gates yourself in the slot. Read the full diff against the
   ticket, including untracked files and any edited tests.
2. Run the `mattpocock-skills:code-review` skill in the slot, with `BASE` as the fixed point and
   the ticket as the spec.
3. Problems → resume the same session with a delta brief (`--session <id>`). At most **2** rework
   rounds. Still failing → **park**: keep the branch and its slot as they are, label the ticket in
   the report as needing the owner, move on. A parked ticket keeps its slot; make one more slot when
   you need it.
4. Clean → commit in the slot with a message that references the ticket (`Closes #n` when on
   GitHub), ending with the attribution lines the session requires. A repo whose instruction files
   forbid attribution gets none.
5. Land it, by the landing mode:
   - **Local (default).** On `BASE` in the main checkout: `git merge --ff-only <branch>`. If `BASE`
     moved, rebase the branch onto it in the slot, re-run the gates, then fast-forward.
   - **`pr`.** Rebase onto `BASE` if it moved and re-run the gates. Push the branch and open a pull
     request: title in the repo's commit style, body saying what changed and why, ending
     `Closes #<issue>`. Wait for the required checks in the background
     (`gh pr checks <n> --required --watch`). Green → the ticket is `landed` with its `pr` number,
     and the pull request stays open for the owner.
   - **`pr merge`.** As `pr`, then merge once every required check is green and the branch is up
     to date, with the merge command the launcher or the repo names (otherwise
     `gh pr merge <n> --squash`). Then `git pull --ff-only` in the main checkout: that commit is
     the new `BASE` for everything still in flight.

   A red check is a review problem: back to the same session, and it counts toward the two rework
   rounds. A conflict → resolve it with the `resolving-merge-conflicts` skill if it is installed,
   re-run the gates; if it is still unclear, park the ticket.
6. Free the slot once landed: `git switch --detach "$BASE"` in the slot, then `git branch -d` the
   ticket branch (keep the branch while its pull request is open). The slot and its installed
   dependencies stay for the next ticket.
7. Update the progress file. Recompute the frontier and dispatch what became ready.

Without `pr`: never push, close issues, comment on issues or open pull requests mid-run.

## 6. Close the run

When nothing is in flight and nothing is ready:

- run the full project gates on `BASE` in the main checkout;
- `push` was given and the gates pass → `git push`, then close each landed issue with a one-line
  comment naming the commit. Without `push` or `pr` → touch nothing remote;
- leave the slots in place. They are the next run's head start;
- send a push notification if the `PushNotification` tool is available: one line, landed / parked /
  skipped counts;
- final report: landed tickets with commit hashes or pull request numbers, parked tickets with their
  branch, slot and the reason, skipped (out) tickets with their open blocker, tickets per lane and
  any lane that dropped out, the implementers' `Decisions` worth a look, and the progress file path.

## Stop conditions mid-run

Only these stop the run (finish or park what is in flight first, then report and wait):

- full gates on `BASE` fail after a landing and the cause is not obvious to fix by reverting that one
  landing (`git revert` it and park the ticket when it is);
- a review shows the ticket set itself is wrong (the plan, not one ticket);
- every lane dropped out (step 1c);
- continuing needs a permission or host-boundary change the owner did not approve.

## Running unattended

Permission prompts block an unattended run. Start the session in auto mode, or allow `git`, `gh`,
`node`, `npm` and the relay scripts beforehand. Remind the owner of this in one line at preflight only
if prompts appeared during it.
