// Talks to the teacher's Google Apps Script web app (see apps-script/Code.gs)

// The Apps Script "Web app URL" (ends in /exec). Paste it between the quotes,
// or set VITE_SCRIPT_URL in Vercel → Settings → Environment Variables.
const PASTED_URL = ''
export const SCRIPT_URL: string = (import.meta.env.VITE_SCRIPT_URL as string | undefined) || PASTED_URL

export const connected = () => SCRIPT_URL.startsWith('https://') || SCRIPT_URL.startsWith('http://localhost')

export interface Rec {
  kind: 'mission' | 'boss'
  skill: string
  q: string
  answer: number | null
  correct: number
  ok: boolean
  hint?: boolean
}

export interface FinishPayload {
  score: number
  missions: number
  boss: number
  hints: number
  startedAt: number
  details: Rec[]
}

export interface ResultRow {
  started: string
  cls: string
  name: string
  status: string
  score: number | ''
  missions: number | ''
  boss: number | ''
  total: number | ''
  hints: number | ''
  finished: string
  minutes: number | ''
  details: Rec[]
}

async function get<T>(params: Record<string, string>): Promise<T> {
  const url = SCRIPT_URL + '?' + new URLSearchParams(params).toString()
  const res = await fetch(url)
  return res.json()
}

async function post<T>(body: object): Promise<T> {
  // text/plain avoids a CORS preflight, which Apps Script doesn't answer
  const res = await fetch(SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
  return res.json()
}

const playedKey = (cls: string, name: string) => `10x-played:${cls}:${name}`
const PENDING = '10x-pending'

function store(key: string, val: string | null) {
  try {
    if (val === null) localStorage.removeItem(key)
    else localStorage.setItem(key, val)
  } catch {
    /* storage blocked — ignore */
  }
}
function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Has this student already played? Checks the Sheet, falls back to this device. */
export async function checkPlayed(cls: string, name: string): Promise<boolean> {
  if (!connected()) return read(playedKey(cls, name)) === '1'
  try {
    const r = await get<{ played: boolean }>({ action: 'check', cls, name })
    return !!r.played
  } catch {
    return read(playedKey(cls, name)) === '1'
  }
}

/** Marks the attempt as started. Returns false if the Sheet says they already played. */
export async function startAttempt(cls: string, name: string): Promise<boolean> {
  store(playedKey(cls, name), '1')
  if (!connected()) return true
  try {
    const r = await post<{ ok: boolean; reason?: string }>({ action: 'start', cls, name })
    return r.ok || r.reason !== 'already'
  } catch {
    return true // offline: let them play, results are sent at the end
  }
}

/** Sends the final result, retrying a few times. Keeps a copy to resend later if it fails. */
export async function finishAttempt(cls: string, name: string, result: FinishPayload): Promise<boolean> {
  if (!connected()) return false
  const body = { action: 'finish', cls, name, result }
  store(PENDING, JSON.stringify(body))
  for (let i = 0; i < 3; i++) {
    try {
      const r = await post<{ ok: boolean }>(body)
      if (r.ok) {
        store(PENDING, null)
        return true
      }
    } catch {
      /* retry */
    }
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)))
  }
  return false
}

/** On page load: resend a result that failed to save last time. */
export async function resendPending() {
  const raw = read(PENDING)
  if (!raw || !connected()) return
  try {
    const r = await post<{ ok: boolean }>(JSON.parse(raw))
    if (r.ok) store(PENDING, null)
  } catch {
    /* try again next time */
  }
}

export async function fetchResults(pin: string) {
  return get<{ ok: boolean; error?: string; rows: ResultRow[]; sheetUrl: string }>({ action: 'results', pin })
}

export async function resetStudent(pin: string, cls: string, name: string) {
  store(playedKey(cls, name), null)
  return get<{ ok: boolean; error?: string }>({ action: 'reset', pin, cls, name })
}
