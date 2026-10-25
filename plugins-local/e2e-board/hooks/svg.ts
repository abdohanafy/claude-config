import type { LiveRun, Ticket } from '../types'
import { group, isActive, openBlockers } from './board'

// The graphical board for surfaces that draw SVG (desktop app, VS Code, mobile).
// Pure: run in, markup out. Animation is CSS inside the SVG, so it keeps moving
// between redraws; the pane redraws only when the file changes or a minute passes.

const PAD = 16
const CARD_W = 230
const CARD_H = 104
const GAP = 14
const ROW = 22

const STATE_COLOR: Record<string, string> = {
  running: 'var(--cyan)',
  reviewing: 'var(--amber)',
  rework: 'var(--violet)',
  landing: 'var(--green)',
}

const STATE_TEXT: Record<string, string> = {
  running: 'implementing',
  reviewing: 'reviewing',
  rework: 'rework',
  landing: 'landing',
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Cut to roughly what fits in `px` at `size`px of a proportional font. */
export function fit(s: string, px: number, size = 12): string {
  const max = Math.max(3, Math.floor(px / (size * 0.58)))
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

export function minutes(fromIso: string | undefined, now: number): string {
  if (!fromIso) return ''
  const ms = now - Date.parse(fromIso)
  if (!Number.isFinite(ms) || ms < 0) return ''
  const m = Math.floor(ms / 60000)
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}m`
}

const STYLE = `
:root, svg { --bg:#ffffff; --panel:#f6f7f9; --ink:#1d2330; --mute:#6b7385; --line:#d8dce4;
  --cyan:#0e8fb3; --amber:#c27a00; --violet:#7a4fd6; --green:#1f9d55; --red:#d64545; --idle:#b8bfcc; }
@media (prefers-color-scheme: dark) {
  :root, svg { --bg:#16181d; --panel:#1f232b; --ink:#e7eaf0; --mute:#8d95a6; --line:#323845;
    --cyan:#38bdf8; --amber:#fbbf24; --violet:#a78bfa; --green:#4ade80; --red:#f87171; --idle:#4b5263; }
}
text { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; fill: var(--ink); }
.mono { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; }
.mute { fill: var(--mute); }
.h { font-weight: 650; }
.panel { fill: var(--panel); stroke: var(--line); }
.live .pulse { animation: pulse 2.4s ease-in-out infinite; }
@keyframes pulse { 0%,100% { stroke-opacity: .35 } 50% { stroke-opacity: 1 } }
.live .spin { animation: spin 1.1s linear infinite; transform-box: fill-box; transform-origin: center; }
@keyframes spin { to { transform: rotate(360deg) } }
.live .flow { stroke-dasharray: 5 6; animation: flow 0.9s linear infinite; }
@keyframes flow { to { stroke-dashoffset: -11 } }
.live .shimmer { animation: shimmer 1.8s linear infinite; }
@keyframes shimmer { from { transform: translateX(-60px) } to { transform: translateX(400px) } }
.live .breathe { animation: breathe 2s ease-in-out infinite; }
@keyframes breathe { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
`

function pill(x: number, y: number, label: string, color: string): string {
  const w = Math.max(44, label.length * 7 + 16)
  return `<rect x="${x}" y="${y}" width="${w}" height="18" rx="9" fill="${color}" fill-opacity=".16" stroke="${color}" stroke-opacity=".5"/>
<text x="${x + w / 2}" y="${y + 13}" font-size="11" text-anchor="middle" style="fill:${color}" class="h">${esc(label)}</text>`
}

function spinner(cx: number, cy: number, color: string, live: boolean): string {
  if (!live) return `<circle cx="${cx}" cy="${cy}" r="6" fill="none" stroke="${color}" stroke-width="2"/>`
  return `<circle cx="${cx}" cy="${cy}" r="6" fill="none" stroke="var(--line)" stroke-width="2"/>
<path class="spin" d="M ${cx} ${cy - 6} A 6 6 0 0 1 ${cx + 6} ${cy}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>`
}

function card(t: Ticket, x: number, y: number, now: number, live: boolean): string {
  const c = STATE_COLOR[t.state] ?? 'var(--cyan)'
  const inner = CARD_W - 28
  const meta = [STATE_TEXT[t.state] ?? t.state, minutes(t.startedAt, now), t.implementer].filter(Boolean).join(' · ')
  const tip = [t.id, t.title, t.branch, t.worktree, t.sessionId && `session ${t.sessionId}`, t.note].filter(Boolean).join('\n')
  return `<g>
<title>${esc(tip)}</title>
<rect class="panel pulse" x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="10" style="stroke:${c}" stroke-width="1.5"/>
<rect x="${x}" y="${y}" width="4" height="${CARD_H}" rx="2" style="fill:${c}"/>
${spinner(x + 20, y + 20, c, live)}
<text x="${x + 34}" y="${y + 24}" font-size="13" class="h">${esc(t.id)}</text>
<text x="${x + 34 + t.id.length * 8 + 6}" y="${y + 24}" font-size="12">${esc(fit(t.title, inner - 20 - t.id.length * 8))}</text>
<text x="${x + 14}" y="${y + 48}" font-size="11" style="fill:${c}">${esc(fit(meta, inner))}</text>
<text x="${x + 14}" y="${y + 68}" font-size="11" class="mono mute">${esc(fit(`⎇ ${t.branch ?? 'no branch yet'}`, inner, 11))}</text>
${t.rework ? pill(x + 14, y + 78, `rework ${t.rework}`, 'var(--violet)') : ''}
${t.note ? `<text x="${x + (t.rework ? 100 : 14)}" y="${y + 91}" font-size="10" class="mute">${esc(fit(t.note, inner - (t.rework ? 86 : 0), 10))}</text>` : ''}
</g>`
}

function idleCard(x: number, y: number): string {
  return `<rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="10" fill="none" stroke="var(--idle)" stroke-dasharray="4 4"/>
<text x="${x + CARD_W / 2}" y="${y + CARD_H / 2 + 4}" font-size="12" text-anchor="middle" class="mute">idle slot</text>`
}

type Row = { mark: string; color: string; text: string; tip?: string }

function list(title: string, color: string, rows: Row[], x: number, y: number, w: number): { svg: string; h: number } {
  if (rows.length === 0) return { svg: '', h: 0 }
  let out = `<text x="${x}" y="${y + 14}" font-size="12" class="h" style="fill:${color}">${esc(title)}</text>
<text x="${x + w}" y="${y + 14}" font-size="11" text-anchor="end" class="mute">${rows.length}</text>
<line x1="${x}" y1="${y + 20}" x2="${x + w}" y2="${y + 20}" stroke="var(--line)"/>`
  rows.forEach((r, i) => {
    const ry = y + 26 + i * ROW
    out += `<g>${r.tip ? `<title>${esc(r.tip)}</title>` : ''}
<text x="${x + 2}" y="${ry + 14}" font-size="12" style="fill:${r.color}">${esc(r.mark)}</text>
<text x="${x + 18}" y="${ry + 14}" font-size="12">${esc(fit(r.text, w - 20))}</text></g>`
  })
  return { svg: out, h: 30 + rows.length * ROW + 10 }
}

export function boardSvg(run: LiveRun, now: number, widthPx: number): { source: string; width: number; height: number } {
  const live = isActive(run, now)
  const g = group(run)
  const counted = run.tickets.filter(t => t.state !== 'out').length
  const W = Math.max(300, Math.min(1000, Math.round(widthPx)))
  const inner = W - PAD * 2

  // Orchestrator.
  const oy = PAD
  const oh = 112
  const phaseColor = run.orchestrator.phase === 'stopped' ? 'var(--red)' : run.orchestrator.phase === 'done' ? 'var(--green)' : 'var(--amber)'
  const pct = counted ? g.landed.length / counted : 0
  const barW = inner - 28
  const dials = [run.implementer, run.model, run.effort].filter(Boolean).join(' · ')
  let body = `<g>
<rect class="panel pulse" x="${PAD}" y="${oy}" width="${inner}" height="${oh}" rx="12" style="stroke:var(--cyan)" stroke-width="2"/>
${spinner(PAD + 22, oy + 24, 'var(--cyan)', live)}
<text x="${PAD + 38}" y="${oy + 29}" font-size="15" class="h">Orchestrator</text>
${pill(PAD + inner - 14 - Math.max(44, run.orchestrator.phase.length * 7 + 16), oy + 14, run.orchestrator.phase, phaseColor)}
<text x="${PAD + 14}" y="${oy + 52}" font-size="12">${esc(fit(run.orchestrator.doing, inner - 28))}</text>
<text x="${PAD + 14}" y="${oy + 72}" font-size="11" class="mono mute">${esc(fit(`⎇ ${run.base.branch}@${run.base.commit.slice(0, 7)}  ·  lane ${run.lane}  ·  ${dials}  ·  ${run.push ? 'push' : 'local only'}`, inner - 28, 11))}</text>
<clipPath id="bar"><rect x="${PAD + 14}" y="${oy + 84}" width="${barW}" height="10" rx="5"/></clipPath>
<g clip-path="url(#bar)">
<rect x="${PAD + 14}" y="${oy + 84}" width="${barW}" height="10" fill="var(--line)"/>
<rect x="${PAD + 14}" y="${oy + 84}" width="${Math.round(barW * pct)}" height="10" fill="var(--green)"/>
${live ? `<rect class="shimmer" x="${PAD + 14}" y="${oy + 84}" width="40" height="10" fill="#fff" fill-opacity=".25"/>` : ''}
</g>
<text x="${PAD + 14}" y="${oy + 108}" font-size="11" class="mute">${g.landed.length} of ${counted} landed · ${g.inFlight.length}/${run.parallel} running · ${minutes(run.startedAt, now)} elapsed</text>
</g>`

  // Implementer slots, connected to the orchestrator.
  const slots = Math.max(run.parallel, g.inFlight.length)
  const perRow = Math.max(1, Math.min(slots, Math.floor((inner + GAP) / (CARD_W + GAP))))
  const rows = Math.ceil(slots / perRow)
  const gridW = perRow * CARD_W + (perRow - 1) * GAP
  const gx = PAD + (inner - gridW) / 2
  const busY = oy + oh + 22
  const cy0 = busY + 22
  const ox = PAD + inner / 2
  body += `<line x1="${ox}" y1="${oy + oh}" x2="${ox}" y2="${busY}" stroke="var(--line)" stroke-width="2"/>`
  for (let i = 0; i < slots; i++) {
    const col = i % perRow
    const row = Math.floor(i / perRow)
    const x = gx + col * (CARD_W + GAP)
    const y = cy0 + row * (CARD_H + GAP)
    const t = g.inFlight[i]
    const cx = x + CARD_W / 2
    const c = t ? (STATE_COLOR[t.state] ?? 'var(--cyan)') : 'var(--idle)'
    if (row === 0) {
      body += `<path class="${t ? 'flow' : ''}" d="M ${ox} ${busY} L ${cx} ${busY} L ${cx} ${y}" fill="none" stroke="${c}" stroke-width="2"${t ? '' : ' stroke-dasharray="2 4"'}/>`
    }
    body += t ? card(t, x, y, now, live) : idleCard(x, y)
  }
  let y = cy0 + rows * (CARD_H + GAP) + 6

  // The queue and the outcomes, in two columns when there is room.
  const groups: [string, string, Row[]][] = [
    ['Next up', 'var(--ink)', g.ready.map(t => ({ mark: '▸', color: 'var(--cyan)', text: `${t.id}  ${t.title}` }))],
    [
      'Waiting',
      'var(--mute)',
      g.waiting.map(t => ({ mark: '⧗', color: 'var(--mute)', text: `${t.id} ← ${openBlockers(run, t).join(', ') || '?'}   ${t.title}` })),
    ],
    [
      'Landed',
      'var(--green)',
      g.landed.map(t => ({ mark: '✓', color: 'var(--green)', text: `${t.id}  ${t.commit?.slice(0, 7) ?? ''}  ${t.title}` })),
    ],
    [
      'Parked, needs you',
      'var(--red)',
      g.parked.map(t => ({
        mark: '✗',
        color: 'var(--red)',
        text: `${t.id}  ${t.note ?? t.title}`,
        tip: [t.title, t.branch, t.worktree].filter(Boolean).join('\n'),
      })),
    ],
    [
      'Out of this run',
      'var(--mute)',
      g.out.map(t => ({ mark: '–', color: 'var(--mute)', text: `${t.id} ← ${(t.blockedBy ?? []).join(', ')}   ${t.title}` })),
    ],
  ]
  const twoCol = inner >= 560
  const colW = twoCol ? (inner - 24) / 2 : inner
  let left = y
  let right = y
  for (const [title, color, rs] of groups) {
    const toRight = twoCol && right < left
    const block = list(title, color, rs, toRight ? PAD + colW + 24 : PAD, toRight ? right : left, colW)
    body += block.svg
    if (toRight) right += block.h
    else left += block.h
  }
  y = Math.max(left, right)

  const log = (run.log ?? []).slice(-6)
  if (log.length) {
    body += `<text x="${PAD}" y="${y + 14}" font-size="12" class="h mute">Log</text>`
    log.forEach((l, i) => {
      body += `<text x="${PAD}" y="${y + 34 + i * 18}" font-size="11" class="mono mute${i === log.length - 1 && live ? ' breathe' : ''}">${esc(fit(`${l.at.slice(11, 16)}  ${l.text}`, inner, 11))}</text>`
    })
    y += 34 + log.length * 18
  }

  const H = Math.round(y + PAD)
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="${live ? 'live' : ''}">
<style>${STYLE}</style>
<rect width="${W}" height="${H}" fill="var(--bg)"/>
${body}
</svg>`
  return { source, width: W, height: H }
}
