// Student phone screen for live games
import { useEffect, useRef, useState } from 'react'
import { TEAMS, fmt } from '../game'
import { CLASSES } from '../roster'
import { Icon, Ship } from '../art'
import { sfx } from '../sound'
import { getBackend, liveReady, type Backend } from './backend'
import { deviceId, deviceStore, pidFor, rankOf, roomPath, type Answer, type Meta, type Player, type QState } from './model'

const SAVE_KEY = '10x-join'
const saveJoin = (v: { room: string; pid: string } | null) => {
  try {
    if (v) deviceStore().setItem(SAVE_KEY, JSON.stringify(v))
    else deviceStore().removeItem(SAVE_KEY)
  } catch {
    /* ignore */
  }
}
const loadJoin = (): { room: string; pid: string } | null => {
  try {
    return JSON.parse(deviceStore().getItem(SAVE_KEY) || 'null')
  } catch {
    return null
  }
}

export default function Join() {
  const urlRoom = new URLSearchParams(window.location.search).get('room') || ''
  const [be, setBe] = useState<Backend | null>(null)
  const [codeInput, setCodeInput] = useState(urlRoom)
  const [room, setRoom] = useState('')
  const [meta, setMeta] = useState<Meta | null>(null)
  const [players, setPlayers] = useState<Record<string, Player>>({})
  const [st, setSt] = useState<QState | null>(null)
  const [pid, setPid] = useState('')
  const [myAnswer, setMyAnswer] = useState<Answer | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [, setTick] = useState(0)
  const device = useRef(deviceId()).current
  const joinedOnce = useRef(false)

  useEffect(() => {
    if (!liveReady()) return
    getBackend().then(setBe)
  }, [])

  // Auto-rejoin after a reload
  useEffect(() => {
    if (!be) return
    const saved = loadJoin()
    const target = urlRoom || saved?.room
    if (saved && target === saved.room) {
      be.get(roomPath(saved.room) + '/meta').then((m) => {
        if (m) {
          setRoom(saved.room)
          setPid(saved.pid)
        }
      })
    } else if (urlRoom.length === 6) {
      openRoom(urlRoom)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [be])

  // room listeners
  useEffect(() => {
    if (!be || !room) return
    const u1 = be.listen(roomPath(room) + '/meta', setMeta)
    const u2 = be.listen(roomPath(room) + '/players', (v) => setPlayers(v || {}))
    const u3 = be.listen(roomPath(room) + '/state', setSt)
    return () => {
      u1()
      u2()
      u3()
    }
  }, [be, room])

  // my answer for the current question
  useEffect(() => {
    if (!be || !room || !pid || !st) return
    setMyAnswer(null)
    return be.listen(`${roomPath(room)}/answers/${st.round}/q${st.i}/${pid}`, setMyAnswer)
  }, [be, room, pid, st?.i, st?.round])

  // presence: mark online, and again after a reconnect
  const me = pid ? players[pid] : undefined
  useEffect(() => {
    if (!be || !room || !pid || !me) return
    if (me.device !== device) return
    if (me.online === false || !joinedOnce.current) {
      joinedOnce.current = true
      be.update(`${roomPath(room)}/players/${pid}`, { online: true })
      be.onDisconnectSet(`${roomPath(room)}/players/${pid}/online`, false)
    }
  }, [be, room, pid, me, device])

  // timer re-render
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 250)
    return () => window.clearInterval(id)
  }, [])

  // buzz on reveal
  const lastPhase = useRef('')
  useEffect(() => {
    if (!st) return
    const key = st.i + st.phase
    if (key !== lastPhase.current) {
      lastPhase.current = key
      if (st.phase === 'reveal' && me?.last?.i === st.i) {
        try {
          navigator.vibrate?.(me.last.ok ? 80 : [60, 60, 60])
        } catch {
          /* ignore */
        }
      }
    }
  }, [st, me])

  async function openRoom(c: string) {
    if (!be) return
    setErr('')
    setBusy(true)
    const m = await be.get(roomPath(c) + '/meta')
    setBusy(false)
    if (!m) {
      setErr('No game with that code. Check the code on the main screen.')
      return
    }
    setRoom(c)
  }

  async function pickName(index: number, name: string) {
    if (!be || !meta) return
    sfx.click()
    setBusy(true)
    const id = pidFor(index)
    const path = `${roomPath(room)}/players/${id}`
    const cur: Player | null = await be.get(path)
    let ok = true
    if (cur && cur.device === device) {
      await be.update(path, { online: true })
    } else {
      const p: Player = { name, device, online: true, joined: be.now(), score: 0, correct: 0 }
      ok = await be.claim(path, p, (c: Player) => c.online === false)
    }
    setBusy(false)
    if (!ok) {
      setErr(`${name} is already in the game on another device.`)
      return
    }
    setErr('')
    setPid(id)
    saveJoin({ room, pid: id })
  }

  async function answer(v: number) {
    if (!be || !st || !pid || myAnswer) return
    sfx.lock()
    try {
      navigator.vibrate?.(30)
    } catch {
      /* ignore */
    }
    const ok = await be.claim(`${roomPath(room)}/answers/${st.round}/q${st.i}/${pid}`, { v, t: be.ts() })
    if (!ok) setErr('Answer already locked.')
  }

  const leave = () => {
    saveJoin(null)
    setPid('')
    setRoom('')
    setMeta(null)
    setSt(null)
    joinedOnce.current = false
  }

  /* ---------- screens ---------- */
  if (!liveReady())
    return (
      <Shell>
        <Center title="Live games are not set up yet" text="Ask your teacher." />
      </Shell>
    )
  if (!be)
    return (
      <Shell>
        <Center title="Connecting…" />
      </Shell>
    )

  // 1. code
  if (!room) {
    return (
      <Shell>
        <div className="j-hero">
          <Ship width={170} />
          <h1>
            ESCAPE THE <span>10X</span> PLANET!
          </h1>
          <p>Enter the game code from your teacher's screen</p>
        </div>
        <form
          className="j-code-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (codeInput.length === 6) openRoom(codeInput)
          }}
        >
          <input
            className="j-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
            aria-label="Game code"
            autoFocus
          />
          {err && <div className="j-err">{err}</div>}
          <button className="j-btn primary" disabled={codeInput.length !== 6 || busy}>
            {busy ? 'Checking…' : 'JOIN'}
          </button>
        </form>
      </Shell>
    )
  }

  if (!meta)
    return (
      <Shell>
        <Center title="Connecting…" />
      </Shell>
    )

  // 2. name
  if (!pid || !me || me.device !== device) {
    const names = CLASSES[meta.cls] || []
    const kicked = !!pid && !me
    return (
      <Shell>
        <div className="j-head">
          <small>CLASS {meta.cls}</small>
          <h2>Tap your name</h2>
          {kicked && <div className="j-err">You were removed from the game. Tap your name to join again.</div>}
          {err && <div className="j-err">{err}</div>}
        </div>
        <div className="j-names">
          {names.map((n, i) => {
            const p = players[pidFor(i)]
            const taken = !!p && p.online !== false && p.device !== device
            return (
              <button key={n} className="j-name" dir="auto" disabled={taken || busy} onClick={() => pickName(i, n)}>
                {n}
                {taken && <small>joined</small>}
              </button>
            )
          })}
        </div>
        <button className="j-link" onClick={leave}>
          Wrong game code?
        </button>
      </Shell>
    )
  }

  const teamBadge = me.team ? <span className={`j-team team-${me.team}`}>{TEAMS[me.team].name}</span> : null
  const { rank, of } = rankOf(players, pid)

  // 3. lobby
  if (meta.status === 'lobby' || !st) {
    return (
      <Shell>
        <div className="j-wait">
          <div className="j-ship-bob">
            <Ship width={200} />
          </div>
          <h2 dir="auto">You're in, {me.name}!</h2>
          {meta.mode === 'turn' ? (
            <>
              {teamBadge}
              <p>When it's your turn, the question will appear here.</p>
            </>
          ) : (
            <p>Race mode: answer every question as fast as you can!</p>
          )}
          <div className="j-pulse">Waiting for your teacher to start…</div>
        </div>
      </Shell>
    )
  }

  const statusBar = (
    <div className="j-status">
      <span dir="auto">{me.name}</span>
      {teamBadge}
      <b>{fmt(me.score || 0)} pts</b>
    </div>
  )

  // 7. end
  if (meta.status === 'end' || st.phase === 'end') {
    const myTeamWon = me.team && st.teamScores[me.team] >= st.teamScores[me.team === 'comets' ? 'rockets' : 'comets']
    return (
      <Shell>
        {statusBar}
        <div className="j-final">
          <Icon name="crown" size={64} />
          <h2>Mission complete!</h2>
          {meta.mode === 'race' ? (
            <p>
              You finished <b>#{rank}</b> of {of} with <b>{fmt(me.score || 0)}</b> points.
            </p>
          ) : (
            <p>
              {myTeamWon ? 'Your team wins! ' : 'Great teamwork! '}
              {me.team ? TEAMS[me.team].name : ''}: <b>{fmt(me.team ? st.teamScores[me.team] : 0)}</b> pts. You earned <b>{fmt(me.score || 0)}</b> for your team.
            </p>
          )}
          <p className="j-muted">You got {me.correct || 0} right. Look at the main screen for the winners!</p>
        </div>
      </Shell>
    )
  }

  const isBoss = st.kind === 'boss'
  const question = isBoss ? (
    <>
      {st.left !== undefined ? fmt(st.left) : <span className="j-q">?</span>} × {st.right !== undefined ? fmt(st.right) : <span className="j-q">?</span>} = {fmt(st.product || 0)}
    </>
  ) : (
    <>
      {fmt(st.a || 0)} × {fmt(st.b || 0)} = <span className="j-q">?</span>
    </>
  )
  const label = isBoss ? 'BOSS · MISSING FACTOR' : `MISSION ${st.i + 1}`

  // 5/6. reveal + board
  if (st.phase === 'reveal' || st.phase === 'board') {
    const mine = me.last && me.last.i === st.i ? me.last : null
    const turnOther = meta.mode === 'turn' && st.turnPid !== pid
    return (
      <Shell>
        {statusBar}
        <div className="j-qline small">{label}</div>
        <div className="j-equation small">{question}</div>
        {turnOther ? (
          <div className="j-result neutral">
            <b dir="auto">{st.turnName || 'Nobody'}</b> answered for {st.turnTeam ? TEAMS[st.turnTeam].name : ''}.
            <span>Answer: {fmt(st.answer ?? 0)}</span>
          </div>
        ) : mine?.ok ? (
          <div className="j-result ok">
            <Icon name="check" size={56} />
            <b>Correct!</b>
            <span>+{fmt(mine.pts)} points</span>
          </div>
        ) : (
          <div className="j-result bad">
            <Icon name="x" size={56} />
            <b>{mine?.none || !myAnswer ? "Time's up!" : 'Not quite'}</b>
            <span>The answer is {fmt(st.answer ?? 0)}</span>
          </div>
        )}
        {meta.mode === 'race' && (
          <div className="j-rank">
            You're <b>#{rank}</b> of {of}
          </div>
        )}
        <div className="j-pulse">Look at the main screen…</div>
      </Shell>
    )
  }

  // 4. ask
  const now = be.now()
  const left = Math.max(0, Math.ceil((st.endAt - now) / 1000))
  const pct = Math.max(0, Math.min(100, ((st.endAt - now) / (st.endAt - st.startAt)) * 100))
  const myTurn = meta.mode === 'race' || st.turnPid === pid
  const timeUp = left <= 0

  return (
    <Shell>
      {statusBar}
      <div className="j-timer">
        <span style={{ width: `${pct}%` }} className={left > 8 ? '' : left > 3 ? 'warn' : 'crit'} />
      </div>
      <div className="j-qline">
        {label}
        <b>{left}s</b>
      </div>
      <div className="j-equation">{question}</div>

      {!myTurn ? (
        <div className="j-watch">
          <Icon name="rocket" size={40} />
          <b dir="auto">{st.turnName}</b>
          <span>is answering for {st.turnTeam ? TEAMS[st.turnTeam].name : ''}. Watch the main screen!</span>
        </div>
      ) : myAnswer ? (
        <div className="j-locked">
          <span className="j-lock-pill">LOCKED IN</span>
          <b>{fmt(myAnswer.v)}</b>
          <span>Wait for the reveal…</span>
        </div>
      ) : timeUp ? (
        <div className="j-locked">
          <b>Time's up!</b>
        </div>
      ) : isBoss ? (
        <Keypad onSubmit={answer} />
      ) : (
        <div className="j-choices">
          {(st.choices || []).map((c, i) => (
            <button key={`${st.i}-${c}`} className={`j-choice c${i}`} onClick={() => answer(c)}>
              <small>{'ABCD'[i]}</small>
              {fmt(c)}
            </button>
          ))}
        </div>
      )}
      {myTurn && meta.mode === 'turn' && !myAnswer && !timeUp && <div className="j-yourturn">YOUR TURN! Your team is counting on you</div>}
    </Shell>
  )
}

function Keypad({ onSubmit }: { onSubmit: (v: number) => void }) {
  const [v, setV] = useState('')
  const press = (k: string) => {
    sfx.click()
    if (k === 'del') setV((s) => s.slice(0, -1))
    else setV((s) => (s.length >= 5 ? s : (s + k).replace(/^0+(?=\d)/, '')))
  }
  return (
    <div className="j-keypad-wrap">
      <div className="j-display">{v ? fmt(Number(v)) : <span>type the missing number</span>}</div>
      <div className="j-keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map((k) =>
          k === 'ok' ? (
            <button key={k} className="j-key ok" disabled={!v} onClick={() => onSubmit(Number(v))}>
              SEND
            </button>
          ) : (
            <button key={k} className={`j-key ${k === 'del' ? 'del' : ''}`} onClick={() => press(k)}>
              {k === 'del' ? '⌫' : k}
            </button>
          ),
        )}
      </div>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="j-page">
      <div className="j-inner">{children}</div>
    </div>
  )
}

function Center({ title, text }: { title: string; text?: string }) {
  return (
    <div className="j-center">
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  )
}
