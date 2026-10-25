Review the code changes **made during this session**, update all project context files to reflect what was built, then commit and push — touching only this session's files.

## Scope rule (read first)

A repo may be worked on from multiple parallel sessions. `/ship` must commit **only the files this session actually changed** — never the whole working tree. Other sessions' uncommitted work must be left exactly as-is.

**How to determine "this session's files":** build the list from your own Edit / Write / file-creation tool calls in *this* conversation. That is the authoritative set. Do **not** infer scope from `git status` alone — it shows every session's changes mixed together.

If you cannot confidently identify which changes are yours (e.g. the session was compacted and the edit history is unclear), **stop and ask** before staging anything. Never guess and `git add -A`.

## Context-file size discipline (read before step 2)

Any file `@`-imported by `CLAUDE.md` (or referenced the same way) loads into every future conversation's context — its size is a permanent, recurring cost, not a one-time write. Before adding to a project state/direction file or a lessons file, check whether it's already grown large (skim its length). If so:

- **Separate "what happened, when" from "what's true now."** A running dated changelog belongs in a plain doc (e.g. `docs/CHANGELOG.md`) that is *not* `@`-imported — read directly when historical rationale is needed. The imported file should hold only current strategy/state, updated in place, not appended to.
- **Lessons/pitfalls entries should be tight** — a bold rule plus a short why-clause, not a full narration of the incident that produced it. Check for an existing near-duplicate lesson before adding a new one; merge instead of stacking similar entries.
- If a project doesn't yet have this split and its context files are large, propose splitting them out (with a short maintenance-rule note in the file itself) rather than continuing to append.

## Steps

1. Build the **session file list**: the exact set of files you created or edited in this conversation. Then run `git status` to confirm those files appear as modified/untracked. Note (but do not touch) any *other* changed files — those belong to other sessions.

2. **Discover and update context files** — scan the repo for files that serve these roles and update only the ones that exist and are relevant to this session's changes:

   - **Project state / direction file** — a file (typically in `.claude/` or the root) that describes what has been built, the current state of the project, active decisions, and what's next. Update it to reflect features or milestones completed this session. Update any "last updated" date.

   - **Lessons / patterns file** — a file that captures non-obvious technical lessons, pitfalls, and canonical patterns for this codebase. Add entries from this session: things that would surprise a future developer, or approaches that should be repeated. Lead each entry with a bold title. Skip obvious things.

   - **Claude instructions file (`CLAUDE.md` or equivalent)** — a file that gives Claude context about the codebase: architecture, key files, commands. Update the key files table and architecture notes if this session added new important files or changed how things fit together.

   - **Roadmap / plan file** — any file tracking what's planned, in-progress, or done. Check off items this session completed. Add new items if gaps or ideas came up. Update dates.

   - **Learning plan file** — if the project tracks a learning agenda, update item statuses for anything this session touched. Move completed items to a done log with today's date.

   - **`README.md`** — update only if this session changed the public-facing interface, setup steps, or feature list in a way a new user would notice. Skip for internal refactors.

   To find these files: look at what's referenced in `CLAUDE.md` (the `@` imports at the top often point to them), check the `.claude/` directory, and scan `docs/` or similar folders. Use the file's content and name to infer its role — don't rely on a specific filename.

   > Any doc edits you make in this step become part of this session's file list — they are yours to commit.

3. Fix `.gitignore` only if *this session* introduced runtime/generated files that are being tracked and shouldn't be (build artifacts, cache, DB files). Don't touch unrelated ignore rules.

4. Stage **only the session file list, by explicit path** — `git add <path1> <path2> ...` (plus any doc files you edited above). **Never `git add -A` or `git add .`** — that would capture other sessions' work. Then commit with a clear conventional-commit message summarizing what this session built. Use the `@'...'@` PowerShell here-string syntax for the commit message. Include `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` at the end.

5. Push to the repo's default branch — check with `git symbolic-ref refs/remotes/origin/HEAD` if unsure.

## Rules
- **Session-scoped only.** Commit exactly the files this session changed — nothing from other sessions, even if `git status` shows them as dirty.
- Only update doc sections actually affected by *this session's* changes — don't rewrite everything.
- Commit message should be `feat(...)`, `fix(...)`, or `refactor(...)` scoped to the main area changed.
- Never commit `.env`, secrets, or large binary files.
- If this session changed nothing meaningful (docs already accurate, no code changes of yours), say so and skip the commit.
- If scope is ambiguous (can't tell which changes are yours), ask before staging — don't fall back to `git add -A`.
