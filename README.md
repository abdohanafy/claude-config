# claude-config

My Claude Code configuration, kept in `~/.claude` so any laptop gets the same setup.

## What is in here

| Path | What it is |
|---|---|
| `settings.json` | Default model, effort level, permissions, enabled plugins, theme, status line hook |
| `statusline.js` | The status line script |
| `CLAUDE.md` | Global instructions loaded in every project |
| `commands/` | Custom slash commands |
| `skills/` | Personal skills (delegate skills, find-skills) |
| `plugins-local/` | Local plugins loaded through `CLAUDE_CODE_PLUGIN_DIRS` |
| `cloud-setup.sh` | Setup script for Claude Code cloud environments (see below) |

`.gitignore` is an allowlist: everything is ignored unless it is listed there. To sync something new, add a `!/path` line to it.

## What is deliberately not in here

- `.credentials.json`: the login. Sign in again on each machine.
- Transcripts and sessions (`projects/*/*.jsonl`, `sessions/`, `history.jsonl`): large, machine-specific, and full of pasted content.
- `plugins/`, `cache/`, `file-history/`, `shell-snapshots/` and similar: rebuilt by Claude Code.
- `skills/synced/`: managed by Claude Code from the claude.ai account.
- `skills/.trash/`: removed skills Claude Code keeps for recovery on that machine.
- `projects/`, including per-project memory: memory follows each machine's repos and work, so it stays local.
- `~/.claude.json`: lives outside this folder and holds user-scope MCP servers plus machine state. Re-add MCP servers on a new machine with `claude mcp add`.

## Set up a new laptop

1. Install Git, the GitHub CLI and Claude Code.
2. Sign in to GitHub so Git can push to this repo (reading needs no login):

   ```bash
   gh auth login
   gh auth setup-git
   ```

3. Quit Claude Code if it is running.

4. Get the config.

   If `~/.claude` does not exist yet:

   ```bash
   git clone https://github.com/abdohanafy/claude-config ~/.claude
   ```

   If `~/.claude` already exists (Claude Code was started once), `git clone` refuses a non-empty folder. Pull into it instead:

   ```bash
   cd ~/.claude
   git init -b main
   git remote add origin https://github.com/abdohanafy/claude-config
   git fetch origin
   git checkout -f -B main origin/main
   ```

   `checkout -f` overwrites the laptop's default `settings.json` with the one from this repo. Local login, sessions and cache are ignored files, so they stay untouched.

5. Start Claude Code and sign in. Plugins listed in `settings.json` reinstall on startup; if one is missing, add it from `/plugin`. Project memory starts empty and builds up on that machine.

6. Re-add any MCP servers with `claude mcp add`.

## Set up a Claude Code cloud environment

Cloud sessions run in a fresh container, so the config has to be pulled in by the environment's setup script.

1. In the Claude app, open the cloud environment menu in the session title bar and create a new cloud environment.
2. Set its Setup script to:

   ```bash
   git clone --depth 1 https://github.com/abdohanafy/claude-config
   bash claude-config/cloud-setup.sh
   ```

The repo is public, so the clone needs no credentials. The script pulls the repo into `~/.claude` the same way as step 4 above, then installs every plugin listed under `enabledPlugins` in `settings.json`. It runs once per container build and the result is cached, so later sessions start with everything in place.

This repo is public, so nothing personal or confidential goes in it: no credentials, no private repo details, no local machine paths.

Note: `model` in `settings.json` also applies in the cloud and can override the model picked when starting a session.

## Day to day

After changing a setting, skill or command:

```bash
cd ~/.claude
git add -A
git commit -m "describe the change"
git push
```

On the other machine:

```bash
cd ~/.claude
git pull
```

Pull before you start on a machine and push when you finish, so both laptops never edit the same file at once.

Before committing, `git status` shows exactly what will be synced. Nothing outside the allowlist can appear there.
