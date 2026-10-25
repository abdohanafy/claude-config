import type { LiveRun, Ticket, TicketState } from '../types'

export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
export const PULSE = ['cyan', 'blue', 'magenta', 'blue']

/** A run is live while its file was touched recently and it has not ended. */
export const STALE_MS = 3 * 60 * 60 * 1000

export function parseRun(text: string): LiveRun {
  const run = JSON.parse(text) as LiveRun
  if (run?.version !== 1 || !Array.isArray(run.tickets) || !run.orchestrator) {
    throw new Error('not an implement-e2e live.json (version 1)')
  }
  return run
}

export function isActive(run: LiveRun | null, now: number): boolean {
  if (!run) return false
  if (run.orchestrator.phase === 'done' || run.orchestrator.phase === 'stopped') return false
  const at = Date.parse(run.updatedAt)
  return Number.isFinite(at) && now - at < STALE_MS
}

const IN_FLIGHT: TicketState[] = ['running', 'reviewing', 'rework', 'landing']

export type Groups = {
  inFlight: Ticket[]
  ready: Ticket[]
  waiting: Ticket[]
  landed: Ticket[]
  parked: Ticket[]
  out: Ticket[]
}

export function group(run: LiveRun): Groups {
  const of = (...states: TicketState[]) => run.tickets.filter(t => states.includes(t.state))
  return {
    inFlight: of(...IN_FLIGHT),
    ready: of('ready'),
    waiting: of('waiting'),
    landed: of('landed'),
    parked: of('parked'),
    out: of('out'),
  }
}

/** Blockers of a waiting ticket that have not landed yet. */
export function openBlockers(run: LiveRun, t: Ticket): string[] {
  const landed = new Set(run.tickets.filter(x => x.state === 'landed').map(x => x.id))
  return (t.blockedBy ?? []).filter(id => !landed.has(id))
}

export function elapsed(fromIso: string | undefined, now: number): string {
  if (!fromIso) return ''
  const ms = now - Date.parse(fromIso)
  if (!Number.isFinite(ms) || ms < 0) return ''
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`
  return `${m}m${String(s % 60).padStart(2, '0')}s`
}

export function bar(done: number, total: number, width: number): string {
  if (total <= 0) return '░'.repeat(width)
  const full = Math.round((done / total) * width)
  return '█'.repeat(full) + '░'.repeat(Math.max(0, width - full))
}

export function statusLine(run: LiveRun, tick: number): string {
  const g = group(run)
  const counted = run.tickets.filter(t => t.state !== 'out').length
  const spin = SPINNER[tick % SPINNER.length]
  const parts = [`e2e ${spin} ${g.landed.length}/${counted} landed`, `${g.inFlight.length} running`]
  if (g.parked.length) parts.push(`${g.parked.length} parked`)
  return parts.join(' · ')
}

export const STATE_LABEL: Record<TicketState, { label: string; color: string }> = {
  waiting: { label: 'waiting', color: 'gray' },
  ready: { label: 'next', color: 'white' },
  running: { label: 'implementing', color: 'cyan' },
  reviewing: { label: 'reviewing', color: 'yellow' },
  rework: { label: 'rework', color: 'magenta' },
  landing: { label: 'landing', color: 'green' },
  landed: { label: 'landed', color: 'green' },
  parked: { label: 'parked', color: 'red' },
  out: { label: 'out', color: 'gray' },
}

export type Sound = 'done' | 'landed' | 'needs' | 'failed'

export type Alert = { sound: Sound; text: string }

/** Loudest first: one sound plays per change, the toast names everything. */
const RANK: Sound[] = ['needs', 'failed', 'done', 'landed']

/**
 * What changed between two reads of the same run, as one alert. Nothing for the
 * first read or a new run, so a reload or a fresh session replays nothing.
 */
export function alertFor(prev: LiveRun | null, next: LiveRun | null, wasActive: boolean, isLive: boolean): Alert | null {
  if (!prev || !next || prev.runId !== next.runId) return null
  const found: Alert[] = []
  const before = new Map(prev.tickets.map(t => [t.id, t.state]))
  const phase = next.orchestrator.phase

  if (phase === 'stopped' && prev.orchestrator.phase !== 'stopped') {
    found.push({ sound: 'needs', text: `Run stopped, needs you: ${next.orchestrator.doing}` })
  }
  if (phase === 'done' && prev.orchestrator.phase !== 'done') {
    const g = group(next)
    found.push(
      g.parked.length
        ? { sound: 'needs', text: `Run done: ${g.landed.length} landed, ${g.parked.length} parked and waiting for you` }
        : { sound: 'done', text: `Run done: all ${g.landed.length} landed` },
    )
  }
  if (wasActive && !isLive && phase !== 'done' && phase !== 'stopped') {
    found.push({ sound: 'failed', text: 'Run went quiet for 3 hours; the session may have crashed' })
  }
  for (const t of next.tickets) {
    const was = before.get(t.id)
    if (t.state === was) continue
    if (t.state === 'parked') found.push({ sound: 'failed', text: `${t.id} parked: ${t.note ?? t.title}` })
    if (t.state === 'landed') found.push({ sound: 'landed', text: `${t.id} landed${t.commit ? ` as ${t.commit.slice(0, 7)}` : ''}` })
  }

  if (found.length === 0) return null
  const sound = RANK.find(s => found.some(a => a.sound === s))!
  return { sound, text: found.map(a => a.text).join(' · ') }
}
