// A tiny real-time database layer. Uses Firebase Realtime Database in production.
// A local "mock" backend (BroadcastChannel between tabs) exists only for testing builds.
import { firebaseConfig } from './firebaseConfig'

type Unsub = () => void
type Cb = (val: any) => void

export interface Backend {
  listen(path: string, cb: Cb): Unsub
  set(path: string, val: unknown): Promise<void>
  update(path: string, val: Record<string, unknown>): Promise<void>
  remove(path: string): Promise<void>
  /** Write once: fails (returns false) if something is already there. */
  claim(path: string, val: unknown, canReplace?: (cur: any) => boolean): Promise<boolean>
  get(path: string): Promise<any>
  /** Milliseconds, corrected to server time */
  now(): number
  /** Value that becomes the server time when written */
  ts(): unknown
  onDisconnectSet(path: string, val: unknown): void
}

export const liveReady = () => !!firebaseConfig.databaseURL || useMock()

const useMock = () => import.meta.env.VITE_LIVE_MOCK === '1'

let backendPromise: Promise<Backend> | null = null
export function getBackend(): Promise<Backend> {
  if (!backendPromise) backendPromise = useMock() ? Promise.resolve(mockBackend()) : firebaseBackend()
  return backendPromise
}

/* ---------------- Firebase ---------------- */
async function firebaseBackend(): Promise<Backend> {
  const { initializeApp } = await import('firebase/app')
  const db = await import('firebase/database')
  const app = initializeApp(firebaseConfig)
  const d = db.getDatabase(app)
  let offset = 0
  db.onValue(db.ref(d, '.info/serverTimeOffset'), (s) => {
    offset = Number(s.val()) || 0
  })
  return {
    listen(path, cb) {
      return db.onValue(db.ref(d, path), (s) => cb(s.val()))
    },
    set: (path, val) => db.set(db.ref(d, path), val),
    update: (path, val) => db.update(db.ref(d, path), val),
    remove: (path) => db.remove(db.ref(d, path)),
    async claim(path, val, canReplace) {
      const r = await db.runTransaction(db.ref(d, path), (cur) => {
        if (cur !== null && !(canReplace && canReplace(cur))) return undefined // abort
        return val
      })
      return r.committed
    },
    async get(path) {
      return (await db.get(db.ref(d, path))).val()
    },
    now: () => Date.now() + offset,
    ts: () => db.serverTimestamp(),
    onDisconnectSet(path, val) {
      db.onDisconnect(db.ref(d, path)).set(val)
    },
  }
}

/* ---------------- Mock (tests only) ---------------- */
function mockBackend(): Backend {
  const ch = new BroadcastChannel('10x-live-mock')
  let root: any = {}
  const listeners = new Set<{ path: string; cb: Cb }>()
  const parts = (p: string) => p.split('/').filter(Boolean)
  const getAt = (p: string) => parts(p).reduce((o, k) => (o == null ? null : o[k] ?? null), root)
  const setAt = (p: string, val: unknown) => {
    const ks = parts(p)
    if (!ks.length) {
      root = val ?? {}
      return
    }
    let o = root
    for (const k of ks.slice(0, -1)) {
      if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}
      o = o[k]
    }
    const last = ks[ks.length - 1]
    if (val === null || val === undefined) delete o[last]
    else o[last] = JSON.parse(JSON.stringify(val))
  }
  const notify = () => listeners.forEach((l) => l.cb(JSON.parse(JSON.stringify(getAt(l.path)))))
  const apply = (op: { t: 'set' | 'update'; p: string; v: any }) => {
    if (op.t === 'set') setAt(op.p, op.v)
    else Object.entries(op.v).forEach(([k, v]) => setAt(op.p + '/' + k, v))
  }
  const send = (op: { t: 'set' | 'update'; p: string; v: any }) => {
    apply(op)
    ch.postMessage({ op })
    notify()
    return Promise.resolve()
  }
  ch.onmessage = (e) => {
    const m = e.data
    if (m.op) {
      apply(m.op)
      notify()
    } else if (m.sync === 'req') ch.postMessage({ sync: 'res', root })
    else if (m.sync === 'res' && Object.keys(root).length === 0) {
      root = m.root
      notify()
    }
  }
  ch.postMessage({ sync: 'req' })
  return {
    listen(path, cb) {
      const l = { path, cb }
      listeners.add(l)
      setTimeout(() => cb(JSON.parse(JSON.stringify(getAt(path)))), 0)
      return () => listeners.delete(l)
    },
    set: (p, v) => send({ t: 'set', p, v }),
    update: (p, v) => send({ t: 'update', p, v }),
    remove: (p) => send({ t: 'set', p, v: null }),
    async claim(p, v, canReplace) {
      const cur = getAt(p)
      if (cur !== null && !(canReplace && canReplace(cur))) return false
      await send({ t: 'set', p, v })
      return true
    },
    get: (p) => Promise.resolve(JSON.parse(JSON.stringify(getAt(p)))),
    now: () => Date.now(),
    ts: () => Date.now(),
    onDisconnectSet() {},
  }
}
