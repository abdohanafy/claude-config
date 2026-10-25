import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Board, LiveRun, Ticket } from '../types'
import type { Alert, Sound } from './board'
import {
  PULSE,
  SPINNER,
  STATE_LABEL,
  alertFor,
  bar,
  elapsed,
  group,
  isActive,
  openBlockers,
  parseRun,
  statusLine,
} from './board'
import { boardSvg } from './svg'

const PANE = 'e2e-board'
const TITLE = 'E2E run'
const board = atom({ plugin: 'e2e-board', key: 'board' } as const, { path: null, run: null } as Board)
const tick = atom({ plugin: 'e2e-board', key: 'tick' } as const, 0)
const minute = atom({ plugin: 'e2e-board', key: 'minute' } as const, 0)

// Module-local caches: a reload starts them over, which costs one re-read.
let lastText: string | undefined
const opened = new Set<string>()
// The last read, to tell what changed. Unset until the first poll, so a reload
// or a new session never replays an old alert.
let seen: { run: LiveRun | null; active: boolean } | undefined

// $.store, across sessions: `sounds` false mutes, `volume` is 1 to 100.
const SOUNDS_KEY = 'sounds'
const VOLUME_KEY = 'volume'
const DEFAULT_VOLUME = 10

async function soundsOn($: EngineInterface): Promise<boolean> {
  return (await $.store.get(SOUNDS_KEY)) !== false
}

async function volume($: EngineInterface): Promise<number> {
  const v = Number(await $.store.get(VOLUME_KEY))
  return Number.isFinite(v) && v >= 1 && v <= 100 ? Math.round(v) : DEFAULT_VOLUME
}

/** Clip lengths in ms, so the Windows player stays open until the clip ends. */
const LENGTH_MS: Record<Sound, number> = { done: 1600, landed: 500, needs: 1500, failed: 750 }

/**
 * Plays one of the mod's sounds on this computer at the stored volume. Claude
 * Code's own player plays nothing in a Windows terminal, so Windows goes through
 * PowerShell's media player, which, unlike SoundPlayer, has a volume.
 */
async function play($: EngineInterface, sound: Sound): Promise<void> {
  const level = (await volume($)) / 100
  const root = $.plugin.root
  if (/^[A-Za-z]:[\\/]/.test(root)) {
    const file = `${root.replace(/\//g, '\\')}\\sounds\\${sound}.wav`.replace(/'/g, "''")
    const script = [
      'Add-Type -AssemblyName PresentationCore',
      '$p = New-Object System.Windows.Media.MediaPlayer',
      `$p.Open([uri]'${file}')`,
      `$p.Volume = ${level}`,
      '$p.Play()',
      `Start-Sleep -Milliseconds ${LENGTH_MS[sound] + 300}`,
      '$p.Close()',
    ].join('; ')
    await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script], { timeoutMs: 15000 })
    return
  }
  await $.audio.play({ asset: `sounds/${sound}.wav` }, { gain: level })
}

async function notify($: EngineInterface, alert: Alert): Promise<void> {
  const urgent = alert.sound === 'needs' || alert.sound === 'failed'
  $.ui.toast(alert.text, { timeoutMs: urgent ? 15000 : 5000 })
  if (await soundsOn($)) void play($, alert.sound).catch(() => undefined)
}

async function livePath($: EngineInterface): Promise<string | null> {
  const r = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (r.exitCode !== 0) return null
  return `${r.stdout.trim().replace(/\\/g, '/')}/implement-e2e/live.json`
}

async function poll($: EngineInterface, path: string): Promise<void> {
  let text: string | undefined
  try {
    text = await $.fs.read(path)
  } catch {
    text = undefined
  }
  if (text !== lastText) {
    lastText = text
    let next: Board = { path, run: null }
    if (text !== undefined) {
      try {
        next = { path, run: parseRun(text) }
      } catch (err) {
        next = { path, run: null, error: err instanceof Error ? err.message : String(err) }
      }
    }
    await update($, board, () => next)
  }

  const { run } = await read($, board)
  const active = isActive(run, Date.now())
  const alert = seen ? alertFor(seen.run, run, seen.active, active) : null
  seen = { run, active }
  if (alert) await notify($, alert)
  if (active && run) {
    const n = await update($, tick, t => t + 1)
    const m = Math.floor(Date.now() / 60000)
    if ((await read($, minute)) !== m) await update($, minute, () => m)
    $.ui.status(statusLine(run, n))
    if (!opened.has(run.runId)) {
      opened.add(run.runId)
      void $.ui.open({ id: PANE, title: TITLE })
    }
  } else {
    $.ui.status(undefined)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'e2e-board',
      description: 'Show the live board of the /implement-e2e run here; `sounds on|off|test`, `volume 1-100` for its alerts',
    })
    const path = await livePath($)
    if (path) {
      await update($, board, b => ({ ...b, path }))
      await poll($, path)
      $.clock.every(1000, () => poll($, path))
    }
    return next(e)
  })

  on('command.run', { command: 'e2e-board' }, async ($, e) => {
    const args = (e.args ?? '').trim().toLowerCase()
    if (args === 'sounds off' || args === 'mute') {
      await $.store.set(SOUNDS_KEY, false)
      return { text: 'E2E board sounds off. Toasts still show. `/e2e-board sounds on` to undo.' }
    }
    if (args === 'sounds on' || args === 'unmute') {
      await $.store.set(SOUNDS_KEY, true)
      return { text: 'E2E board sounds on.' }
    }
    const vol = /^(?:sounds\s+)?volume(?:\s+(\d+))?%?$/.exec(args)
    if (vol) {
      if (vol[1] === undefined) return { text: `E2E board volume is ${await volume($)}%. Set it with \`/e2e-board volume 1-100\`.` }
      const v = Math.max(1, Math.min(100, Number(vol[1])))
      await $.store.set(VOLUME_KEY, v)
      await play($, 'needs').catch(() => undefined)
      return { text: `E2E board volume set to ${v}% (played the "needs" sound at that level).` }
    }
    if (args === 'sounds test' || args === 'test') {
      for (const s of ['done', 'landed', 'needs', 'failed'] as const) {
        await play($, s).catch(() => undefined)
      }
      return { text: `Played done, landed, needs, failed. Sounds are ${(await soundsOn($)) ? 'on' : 'off'}, volume ${await volume($)}%.` }
    }
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'E2E board opened.' }
  })

  // The orchestrator asking a question during a run is input needed.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const { run } = await read($, board)
    if (run && isActive(run, Date.now())) {
      await notify($, { sound: 'needs', text: 'The /implement-e2e run is asking you a question' })
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { path, run, error } = await read($, board)

    if (!run) {
      return (
        <Box flexDirection="column">
          <Text bold>No /implement-e2e run here yet.</Text>
          <Text dimColor>{error ? `Bad live file: ${error}` : 'Start one with /implement-e2e.'}</Text>
          <Text dimColor wrap="truncate-start">{path ?? 'Not a git repository.'}</Text>
        </Box>
      )
    }

    // Surfaces that draw SVG get the diagram. It reads `minute`, not `tick`, so its
    // CSS animation is not restarted every second.
    if (e.surface !== 'terminal') {
      await read($, minute)
      const { Svg } = $.ui.resolve(e)
      const g = group(run)
      const { source } = boardSvg(run, Date.now(), (e.props.bodyColumns ?? 60) * 8)
      const alt = `implement-e2e run ${run.runId}: ${run.orchestrator.phase}, ${g.landed.length} landed, ${g.inFlight.length} running, ${g.ready.length} next, ${g.waiting.length} waiting, ${g.parked.length} parked`
      return (
        <Box flexDirection="column">
          <Svg source={source} alt={alt} isInteractive />
        </Box>
      )
    }

    const n = await read($, tick)
    const now = Date.now()
    const live = isActive(run, now)
    const spin = live ? SPINNER[n % SPINNER.length] : '■'
    const pulse = live ? PULSE[n % PULSE.length] : 'gray'
    const g = group(run)
    const counted = run.tickets.filter(t => t.state !== 'out').length
    const width = Math.max(10, Math.min(24, (e.props.bodyColumns ?? 40) - 24))
    const dials = [run.implementer, run.model, run.effort].filter(Boolean).join(' ')
    const slots = Math.max(run.parallel, g.inFlight.length)
    const logRoom = Math.max(0, (e.viewport?.rows ?? 40) - 30)

    const card = (t: Ticket) => {
      const s = STATE_LABEL[t.state]
      return (
        <Box key={`card-${t.id}`} flexDirection="column" borderStyle="round" borderColor={s.color} paddingX={1} marginLeft={2}>
          <Box flexDirection="row" gap={1}>
            <Text color={s.color}>{spin}</Text>
            <Text bold>{t.id}</Text>
            <Text wrap="truncate">{t.title}</Text>
          </Box>
          <Text color={s.color} wrap="truncate">
            {[s.label, elapsed(t.startedAt, now), t.implementer, t.rework ? `rework ${t.rework}` : '']
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {t.branch && <Text dimColor wrap="truncate">⎇ {t.branch}</Text>}
          {t.note && <Text dimColor wrap="truncate">{t.note}</Text>}
        </Box>
      )
    }

    const idle = (i: number) => (
      <Box key={`idle-${i}`} borderStyle="round" borderDimColor paddingX={1} marginLeft={2}>
        <Text dimColor>○ idle slot</Text>
      </Box>
    )

    const section = (title: string, color: string, rows: { key: string; text: string }[]) =>
      rows.length === 0 ? null : (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={color}>
            {title} ({rows.length})
          </Text>
          {rows.map(r => (
            <Text key={r.key} wrap="truncate">
              {'  '}
              {r.text}
            </Text>
          ))}
        </Box>
      )

    return (
      <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="double" borderColor={pulse} paddingX={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={pulse}>{spin}</Text>
            <Text bold>Orchestrator</Text>
            <Text color="yellow">{run.orchestrator.phase}</Text>
          </Box>
          <Text wrap="truncate">{run.orchestrator.doing}</Text>
          <Text dimColor wrap="truncate">
            ⎇ {run.base.branch}@{run.base.commit.slice(0, 7)} · lane {run.lane} · {dials}
          </Text>
          <Text>
            {bar(g.landed.length, counted, width)} {g.landed.length}/{counted} landed · {elapsed(run.startedAt, now)}
            {run.push ? ' · push' : ' · local'}
          </Text>
        </Box>

        <Text dimColor>
          {'  ┃ '}implementers {g.inFlight.length}/{run.parallel}
        </Text>
        {Array.from({ length: slots }, (_, i) => {
          const t = g.inFlight[i]
          return t ? card(t) : idle(i)
        })}

        {section(
          'Next up',
          'white',
          g.ready.map(t => ({ key: `r-${t.id}`, text: `▸ ${t.id} ${t.title}` })),
        )}
        {section(
          'Waiting',
          'gray',
          g.waiting.map(t => ({ key: `w-${t.id}`, text: `⧗ ${t.id} ← ${openBlockers(run, t).join(', ') || '?'}  ${t.title}` })),
        )}
        {section(
          'Landed',
          'green',
          g.landed.map(t => ({ key: `l-${t.id}`, text: `✓ ${t.id} ${t.commit?.slice(0, 7) ?? ''} ${t.title}` })),
        )}
        {section(
          'Parked, needs you',
          'red',
          g.parked.map(t => ({ key: `p-${t.id}`, text: `✗ ${t.id} ${t.note ?? ''}  ⎇ ${t.branch ?? ''}` })),
        )}
        {section(
          'Out of this run',
          'gray',
          g.out.map(t => ({ key: `o-${t.id}`, text: `– ${t.id} ← ${(t.blockedBy ?? []).join(', ')}  ${t.title}` })),
        )}
        {logRoom > 0 &&
          section(
            'Log',
            'blue',
            (run.log ?? []).slice(-logRoom).map((l, i) => ({ key: `g-${i}`, text: `${l.at.slice(11, 16)} ${l.text}` })),
          )}
      </Box>
    )
  })
}

