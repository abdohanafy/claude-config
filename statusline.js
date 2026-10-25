#!/usr/bin/env node
// Claude Code statusLine script.
// Reads the session JSON from stdin and prints a single status line.
// Any field missing from the input is silently omitted (never throws).

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function safe(fn) {
  try {
    return fn();
  } catch (e) {
    return undefined;
  }
}

// --- Style -------------------------------------------------------------
// Colored blocks: every segment sits on its own muted pastel background
// with dark text. Mid-brightness backgrounds keep it colorful without
// glare. No bold, no blinking. 256-color codes (fine in Windows Terminal).
const RESET = '\x1b[0m';
const fg = (n) => `\x1b[38;5;${n}m`;
const bg = (n) => `\x1b[48;5;${n}m`;

const TEXT = 235; // dark text inside every block
const LABEL = 239; // softer dark for labels (eff, git, ctx, 5h, 7d)

// Block backgrounds, one hue per segment.
const BG = {
  model: 110, // soft sky blue
  effort: 182, // soft orchid
  effortDefault: 250, // light gray — effort taken from settings, not live
  dir: 151, // soft mint
  branch: 146, // soft lavender
  cost: 187, // soft cream
  meter: 252, // pale gray — behind the bars, so the bar colors read clearly
};

// Deeper ramp for bar segments and percentages, readable on the pale meter
// background. The bar warms up as it fills.
function levelColor(pct) {
  if (pct >= 90) return 131; // dusty red
  if (pct >= 70) return 137; // amber brown
  if (pct >= 50) return 101; // olive
  return 65; // sage green
}
const BAR_EMPTY = 246; // mid gray for the unfilled part

// One block: " text " on the given background. Inner pieces only change
// the foreground, so the background runs unbroken to the end.
function block(content, bgColor) {
  return `${bg(bgColor)}${fg(TEXT)} ${content}${fg(TEXT)} ${RESET}`;
}

function label(text) {
  return `${fg(LABEL)}${text}${fg(TEXT)}`;
}

// Thin gradient bar with its percentage, e.g. "━━━━━━┄┄┄┄ 62%". Each filled
// segment takes the ramp color of its own position.
function bar(pct, segments = 10) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * segments);
  let out = '';
  for (let i = 0; i < filled; i++) {
    out += fg(levelColor(((i + 0.5) / segments) * 100)) + '━';
  }
  out += fg(BAR_EMPTY) + '┄'.repeat(segments - filled);
  return `${out} ${fg(levelColor(clamped))}${Math.round(clamped)}%`;
}

function main() {
  let input = {};
  const raw = safe(() => fs.readFileSync(0, 'utf8'));
  if (raw) {
    input = safe(() => JSON.parse(raw)) || {};
  }

  const blocks = [];

  // Model display name
  const modelName = input.model && input.model.display_name;
  if (modelName) blocks.push(block(modelName, BG.model));

  // Reasoning effort level. Primary source: the session JSON's top-level
  // `effort.level` field (live, only present when the current model supports
  // reasoning effort). Fallback: the static `effortLevel` in settings.json
  // (the configured default; shown on gray since it may not reflect the live
  // session or apply to the current model).
  let effortLevel = input.effort && input.effort.level;
  const effortIsLive = Boolean(effortLevel);
  if (!effortLevel) {
    const settings = safe(() =>
      JSON.parse(
        fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8')
      )
    );
    if (settings && settings.effortLevel) effortLevel = settings.effortLevel;
  }
  if (effortLevel) {
    blocks.push(
      block(
        `${label('eff')} ${effortLevel}`,
        effortIsLive ? BG.effort : BG.effortDefault
      )
    );
  }

  // Current directory (basename, keeps the line short)
  const cwd =
    (input.workspace && input.workspace.current_dir) || input.cwd || undefined;
  if (cwd) {
    const trimmed = cwd.replace(/[\\/]+$/, '');
    const base = trimmed.split(/[\\/]/).pop() || trimmed;
    blocks.push(block(base, BG.dir));
  }

  // Git branch (skip optional locks; omit if not a repo or git missing)
  if (cwd) {
    const branch = safe(() =>
      execSync('git --no-optional-locks rev-parse --abbrev-ref HEAD', {
        cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim()
    );
    if (branch && branch !== 'HEAD') {
      blocks.push(block(`${label('git')} ${branch}`, BG.branch));
    }
  }

  // Context window used percentage
  const usedPct =
    input.context_window && input.context_window.used_percentage;
  if (usedPct !== undefined && usedPct !== null) {
    blocks.push(block(`${label('ctx')} ${bar(usedPct)}`, BG.meter));
  }

  // Session cost (field name varies by Claude Code version; check the
  // common locations and omit entirely if none are present)
  const costUsd =
    (input.cost && input.cost.total_cost_usd) ??
    (input.session_cost && input.session_cost.total_cost_usd);
  if (costUsd !== undefined && costUsd !== null) {
    blocks.push(block(`$${Number(costUsd).toFixed(2)}`, BG.cost));
  }

  // Rate limits: 5-hour and 7-day usage, same bars as the context window.
  const fiveHour =
    input.rate_limits &&
    input.rate_limits.five_hour &&
    input.rate_limits.five_hour.used_percentage;
  if (fiveHour !== undefined && fiveHour !== null) {
    blocks.push(block(`${label('5h')} ${bar(fiveHour)}`, BG.meter));
  }

  const sevenDay =
    input.rate_limits &&
    input.rate_limits.seven_day &&
    input.rate_limits.seven_day.used_percentage;
  if (sevenDay !== undefined && sevenDay !== null) {
    blocks.push(block(`${label('7d')} ${bar(sevenDay)}`, BG.meter));
  }

  // One plain space between blocks so each reads as its own pill.
  process.stdout.write(blocks.join(' '));
}

safe(main);
