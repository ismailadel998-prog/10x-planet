// Shared shapes and rules for live (multi-phone) games
import type { TeamId } from '../game'

export type LiveMode = 'turn' | 'race'
export type Phase = 'ask' | 'reveal' | 'board' | 'end'

export interface Meta {
  cls: string
  mode: LiveMode
  status: 'lobby' | 'play' | 'end'
  created: number
}

export interface Player {
  name: string
  team?: TeamId
  device: string
  online: boolean
  joined: number
  score: number
  correct: number
  last?: { i: number; ok: boolean; pts: number; none?: boolean }
}

export interface QState {
  i: number
  round: string // answers live under answers/<round>/q<i>
  total: number
  kind: 'mission' | 'boss'
  a?: number
  b?: number
  choices?: number[]
  left?: number // missing → this side is the "?"
  right?: number
  product?: number
  phase: Phase
  startAt: number
  endAt: number
  turnTeam?: TeamId
  turnPid?: string
  turnName?: string
  answer?: number // only written when revealed
  shields: number
  teamScores: Record<TeamId, number>
}

export interface Answer {
  v: number
  t: number
}

export const MISSION_SECS = 20
export const BOSS_SECS = 30
export const TURN_MISSION_PTS = 200
export const TURN_BOSS_PTS = 300

/** Race: right answers earn 500-1000, faster = more */
export function racePoints(ok: boolean, t: number, startAt: number, endAt: number) {
  if (!ok) return 0
  const frac = Math.min(1, Math.max(0, (t - startAt) / Math.max(1, endAt - startAt)))
  return 500 + Math.round(500 * (1 - frac))
}

export const roomPath = (code: string) => `rooms/${code}`
export const pidFor = (rosterIndex: number) => `p${rosterIndex}`

// Test builds keep each tab separate, like separate phones
export const deviceStore = (): Storage => (import.meta.env.VITE_LIVE_MOCK === '1' ? sessionStorage : localStorage)

export function deviceId(): string {
  try {
    let id = deviceStore().getItem('10x-device')
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36)
      deviceStore().setItem('10x-device', id)
    }
    return id
  } catch {
    return 'dev-' + Math.random().toString(36).slice(2)
  }
}

export const qText = (s: QState) =>
  s.kind === 'mission' ? `${s.a} × ${s.b}` : `${s.left ?? '?'} × ${s.right ?? '?'} = ${s.product}`

export const rankOf = (players: Record<string, Player>, pid: string) => {
  const list = Object.entries(players).sort((x, y) => (y[1].score || 0) - (x[1].score || 0))
  return { rank: list.findIndex(([id]) => id === pid) + 1, of: list.length }
}
