import { expect, test } from 'claude-code/testing'

import type { LiveRun } from '../types'
import { alertFor, bar, elapsed, group, isActive, openBlockers, parseRun, statusLine } from './board'
import { boardSvg, esc, fit, minutes } from './svg'

const NOW = Date.parse('2026-10-03T10:00:00Z')

const run: LiveRun = {
  version: 1,
  runId: 'r1',
  repo: 'video-system',
  base: { branch: 'main', commit: 'ca3da56aaaaaaa' },
  lane: 'implement',
  implementer: 'claude',
  parallel: 3,
  push: false,
  startedAt: '2026-10-03T09:30:00Z',
  updatedAt: '2026-10-03T09:59:30Z',
  orchestrator: { phase: 'waiting', doing: 'waiting on #31, #33' },
  tickets: [
    { id: '#30', title: 'Seed fixtures', state: 'landed', commit: 'abc1234' },
    { id: '#31', title: 'Zoom presets', state: 'running', startedAt: '2026-10-03T09:52:48Z' },
    { id: '#33', title: 'Caption style', state: 'reviewing' },
    { id: '#34', title: 'Outro card', state: 'ready' },
    { id: '#35', title: 'Thumbnail', state: 'waiting', blockedBy: ['#30', '#31'] },
    { id: '#36', title: 'Shorts', state: 'parked', note: 'gates fail after 2 reworks' },
    { id: '#40', title: 'Spanish', state: 'out', blockedBy: ['#12'] },
  ],
}

test('groups tickets by where they are in the run', async () => {
  const g = group(run)
  expect(g.inFlight.map(t => t.id)).toEqual(['#31', '#33'])
  expect(g.ready.map(t => t.id)).toEqual(['#34'])
  expect(g.landed.map(t => t.id)).toEqual(['#30'])
  expect(g.parked.map(t => t.id)).toEqual(['#36'])
  expect(g.out.map(t => t.id)).toEqual(['#40'])
})

test('a waiting ticket shows only the blockers not landed yet', async () => {
  expect(openBlockers(run, run.tickets[4]!)).toEqual(['#31'])
})

test('a run is live until done, stopped or stale', async () => {
  expect(isActive(run, NOW)).toBe(true)
  expect(isActive({ ...run, orchestrator: { phase: 'done', doing: '' } }, NOW)).toBe(false)
  expect(isActive(run, NOW + 4 * 60 * 60 * 1000)).toBe(false)
})

test('status line counts landed against everything but out', async () => {
  expect(statusLine(run, 0)).toBe('e2e ⠋ 1/6 landed · 2 running · 1 parked')
})

test('small formatters', async () => {
  expect(elapsed('2026-10-03T09:52:48Z', NOW)).toBe('7m12s')
  expect(elapsed('2026-10-03T07:55:00Z', NOW)).toBe('2h05m')
  expect(bar(1, 4, 8)).toBe('██░░░░░░')
  expect(() => parseRun('{"version":2}')).toThrow()
  expect(parseRun(JSON.stringify(run)).runId).toBe('r1')
})

test('the pane says how to start when there is no run', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'e2e-board',
      surface,
      component: 'Pane',
      requestId: 'e2e-board',
      props: {
        title: 'E2E run',
        isFocused: false,
        bodyColumns: 50,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 40 },
        view: {},
      },
    })
    expect(await ui.find({ type: 'Text', text: /No \/implement-e2e run/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the pane draws a full run on every surface', async ($, on) => {
  on('process.run', async () => ({ value: { exitCode: 0, stdout: '/r/.git', stderr: '' } }) as never)
  on('fs.read', async () => ({ value: JSON.stringify({ ...run, updatedAt: new Date().toISOString() }) }) as never)
  on('session.start', async () => ({ cwd: '/r' }) as never)
  on('command.register', async () => ({ value: { command: 'e2e-board' } }) as never)
  on('clock.every', async () => ({ value: undefined }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true } as never)
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const svg = surface !== 'terminal'
    const ui = await $.ui.mount({
      plugin: 'e2e-board',
      surface,
      component: 'Pane',
      requestId: 'e2e-board',
      props: {
        title: 'E2E run',
        isFocused: false,
        bodyColumns: 60,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 60 },
        view: {},
      },
    })
    if (svg) {
      const el = (await ui.find({ type: 'Svg' })) as unknown as { props: { source: string; alt: string; isInteractive?: boolean } }
      expect(el.props.source).toContain('Orchestrator')
      expect(el.props.source).toContain('#35 ← #31')
      expect(el.props.alt).toContain('1 landed, 2 running')
      expect(el.props.isInteractive).toBe(true)
    } else {
      expect(await ui.find({ type: 'Text', text: 'Orchestrator' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /#36 gates fail/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /#35 ← #31/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /idle slot/ })).toBeDefined()
    }
    await ui.unmount()
  }
})

test('the SVG board draws every group, escapes titles and stays under the size cap', async () => {
  const tricky: LiveRun = {
    ...run,
    tickets: [...run.tickets, { id: '#41', title: 'Fix <b> & "quotes"', state: 'ready' }],
  }
  const { source, width, height } = boardSvg(tricky, NOW, 800)
  expect(source.startsWith('<svg')).toBe(true)
  expect(source).toContain('class="live"')
  for (const s of ['Next up', 'Waiting', 'Landed', 'Parked, needs you', 'Out of this run', 'idle slot', 'abc1234']) {
    expect(source).toContain(s)
  }
  expect(source).toContain('Fix &lt;b&gt; &amp; &quot;quotes&quot;')
  expect(source).not.toContain('<b>')
  expect(source.length).toBeLessThan(131072)
  expect(width).toBe(800)
  expect(height).toBeGreaterThan(300)
  const done = boardSvg({ ...run, orchestrator: { phase: 'done', doing: 'finished' } }, NOW, 400)
  expect(done.source).not.toContain('class="live"')
})

test('svg helpers', async () => {
  expect(esc('a<b>&"')).toBe('a&lt;b&gt;&amp;&quot;')
  expect(fit('abcdefghijklmnopqrstuvwxyz', 70)).toBe('abcdefghi…')
  expect(minutes('2026-10-03T09:52:48Z', NOW)).toBe('7m')
  expect(minutes('2026-10-03T07:55:00Z', NOW)).toBe('2h05')
})

test('alerts: one sound per change, loudest wins, nothing on a first read', async () => {
  const at = (patch: Partial<LiveRun>, tickets?: LiveRun['tickets']): LiveRun => ({ ...run, ...patch, tickets: tickets ?? run.tickets })
  const swap = (id: string, t: Partial<LiveRun['tickets'][number]>) => run.tickets.map(x => (x.id === id ? { ...x, ...t } : x))

  expect(alertFor(null, run, false, true)).toBeNull()
  expect(alertFor(run, { ...run, runId: 'r2' }, true, true)).toBeNull()
  expect(alertFor(run, run, true, true)).toBeNull()

  expect(alertFor(run, at({}, swap('#31', { state: 'landed', commit: 'def5678aa' })), true, true)).toEqual({
    sound: 'landed',
    text: '#31 landed as def5678',
  })
  expect(alertFor(run, at({}, swap('#33', { state: 'parked', note: 'tests fail' })), true, true)?.sound).toBe('failed')

  const allLanded = run.tickets.map(t => (t.state === 'out' ? t : { ...t, state: 'landed' as const }))
  const done = alertFor(run, at({ orchestrator: { phase: 'done', doing: '' } }, allLanded), true, false)
  expect(done?.sound).toBe('done')
  expect(done?.text).toContain('Run done: all 6 landed')

  const doneParked = alertFor(run, at({ orchestrator: { phase: 'done', doing: '' } }), true, false)
  expect(doneParked?.sound).toBe('needs')

  const stopped = alertFor(run, at({ orchestrator: { phase: 'stopped', doing: 'gates fail on main' } }, swap('#31', { state: 'landed' })), true, false)
  expect(stopped?.sound).toBe('needs')
  expect(stopped?.text).toContain('gates fail on main')
  expect(stopped?.text).toContain('#31 landed')

  expect(alertFor(run, run, true, false)?.sound).toBe('failed')
})

test('sounds test plays all four through this computer', async ($, on) => {
  const played: string[] = []
  on('process.run', async (_, e) => {
    played.push(JSON.stringify(e))
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('audio.play', async (_, e) => {
    played.push(JSON.stringify(e))
    return { value: undefined } as never
  })
  on('store.get', async () => ({ value: undefined }) as never)
  const r = await $.command.run({ command: 'e2e-board', args: 'sounds test' } as never)
  expect(JSON.stringify(r)).toContain('Played done, landed, needs, failed')
  expect(played.length).toBe(4)
  for (const s of ['done', 'landed', 'needs', 'failed']) expect(played.some(p => p.includes(`${s}.wav`))).toBe(true)
  expect(played.every(p => p.includes('Volume = 0.1') || p.includes('"gain":0.1'))).toBe(true)
})

test('volume is stored, clamped and played at that level', async ($, on) => {
  const store = new Map<string, unknown>()
  const played: string[] = []
  on('store.get', async (_, e) => ({ value: store.get((e as unknown as { key: string }).key) }) as never)
  on('store.set', async (_, e) => {
    const { key, value } = e as unknown as { key: string; value: unknown }
    store.set(key, value)
    return { value: undefined } as never
  })
  on('process.run', async (_, e) => {
    played.push(JSON.stringify(e))
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('audio.play', async (_, e) => {
    played.push(JSON.stringify(e))
    return { value: undefined } as never
  })
  const r = await $.command.run({ command: 'e2e-board', args: 'volume 250' } as never)
  expect(JSON.stringify(r)).toContain('volume set to 100%')
  expect(played.some(p => p.includes('Volume = 1') || p.includes('"gain":1'))).toBe(true)
  const q = await $.command.run({ command: 'e2e-board', args: 'volume' } as never)
  expect(JSON.stringify(q)).toContain('volume is 100%')
})
