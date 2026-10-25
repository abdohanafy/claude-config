// The live file /implement-e2e writes at <git-common-dir>/implement-e2e/live.json.

export type TicketState =
  | 'waiting' // a blocker in this run is not landed yet
  | 'ready' // next up, waiting for a free slot
  | 'running' // implementer working in its worktree
  | 'reviewing' // orchestrator re-running gates and code review
  | 'rework' // implementer resumed with a delta brief
  | 'landing' // commit, rebase, fast-forward
  | 'landed'
  | 'parked' // needs the owner
  | 'out' // blocked by something outside the run

export type Ticket = {
  id: string
  title: string
  state: TicketState
  blockedBy?: string[]
  branch?: string
  worktree?: string
  implementer?: string
  sessionId?: string
  startedAt?: string
  endedAt?: string
  rework?: number
  commit?: string
  note?: string
}

export type RunPhase =
  | 'preflight'
  | 'dispatching'
  | 'waiting'
  | 'reviewing'
  | 'landing'
  | 'closing'
  | 'done'
  | 'stopped'

export type LiveRun = {
  version: 1
  runId: string
  repo: string
  base: { branch: string; commit: string }
  lane: string
  implementer: string
  model?: string
  effort?: string
  parallel: number
  push: boolean
  startedAt: string
  updatedAt: string
  orchestrator: { phase: RunPhase; doing: string }
  tickets: Ticket[]
  log?: { at: string; text: string }[]
}

export type Board = {
  /** Absolute path of live.json, or null outside a git repo. */
  path: string | null
  run: LiveRun | null
  /** Why the file could not be read or parsed, when it exists but is bad. */
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    /** `tick` drives the terminal spinner every second; `minute` redraws the SVG board, whose animation is its own. */
    'e2e-board': { board: Board; tick: number; minute: number }
  }
}
