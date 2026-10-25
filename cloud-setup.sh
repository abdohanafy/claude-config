#!/bin/bash
# Setup script for Claude Code cloud environments.
# Syncs this repo into ~/.claude and installs the plugins enabled in settings.json.
#
# Use: set the cloud environment's Setup script to:
#   git clone --depth 1 https://github.com/abdohanafy/claude-config && bash claude-config/cloud-setup.sh
# The setup script starts one directory above the session's repositories.
set -euo pipefail
export PATH="/opt/node22/bin:$PATH"

CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SRC="$(pwd)/claude-config"

if [ ! -d "$SRC/.git" ]; then
  # Fallback when the repo is not checked out next to us (only works if the session can read it).
  git clone --depth 1 https://github.com/abdohanafy/claude-config "$SRC"
fi

# Pull the repo into ~/.claude in place, same as the README's "folder already exists" path.
# The allowlist .gitignore leaves the container's own files (sessions, synced skills, hooks) alone.
mkdir -p "$CFG"
if [ ! -d "$CFG/.git" ]; then
  git -C "$CFG" init -q -b main
  git -C "$CFG" remote add origin "$SRC"
fi
git -C "$CFG" fetch -q --depth 1 origin main
git -C "$CFG" checkout -q -f -B main origin/main

# Install every plugin enabled in settings.json now, so they are baked into the cached image.
claude plugin marketplace add anthropics/claude-plugins-official >/dev/null 2>&1 || true
for p in $(node -e 'const s=require(process.argv[1]).enabledPlugins||{};for(const k in s)if(s[k])console.log(k)' "$CFG/settings.json"); do
  claude plugin install "$p" >/dev/null 2>&1 || echo "WARN: plugin install failed: $p"
done
claude plugin list
