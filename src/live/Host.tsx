// Teacher's shared screen for live games (turn teams or race)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { MISSIONS, BOSS_SHIELDS, TEAMS, fmt, lessonBossQs, makeMissions, other, workedSteps, type TeamId } from '../game'
import { CLASSES } from '../roster'
import { Asteroid, CaptainNull, Icon, Planet, Ship, Stars } from '../art'
import { Bolts, IconButton, SoundButton, TeamCard, useStageScale } from '../App'
import { setSound, sfx } from '../sound'
import { getBackend, liveReady, type Backend } from './backend'
import {
  BOSS_SECS,
  MISSION_SECS,
  TURN_BOSS_PTS,
  TURN_MISSION_PTS,
  racePoints,
  roomPath,
  type Answer,
  type LiveMode,
  type Meta,
  type Player,
  type QState,
} from './model'

interface HostQ {
  kind: 'mission' | 'boss'
  a?: number
  b?: number
  choices?: number[]
  left?: number
  right?: number
  product?: number
  answer: number
  worked?: string
}

function buildQuestions(): HostQ[] {
  const ms: HostQ[] = makeMissions().map((m) => ({ kind: 'mission', a: m.a, b: m.b, choices: m.choices, answer: m.answer, worked: workedSteps(m) }))
  const bs: HostQ[] = lessonBossQs().map((q) => ({
    kind: 'boss',
    left: q.left ?? undefined,
    right: q.right ?? undefined,
    product: q.product,
    answer: q.answer,
  }))
  return [...ms, ...bs]
}

const newCode = () => String(Math.floor(100000 + Math.random() * 900000))
const sortedPlayers = (ps: Record<string, Player>) => Object.entries(ps).sort((a, b) => (a[1].joined || 0) - (b[1].joined || 0))

export default function Host() {
  const params = new URLSearchParams(window.location.search)
  const cls = (params.get('class') || '').toUpperCase()
  const mode: LiveMode = params.get('mode') === 'race' ? 'race' : 'turn'
  const scale = useStageScale()

  const [be, setBe] = useState<Backend | null>(null)
  const [code, setCode] = useState('')
  const [openErr, setOpenErr] = useState('')
  const [meta, setMeta] = useState<Meta | null>(null)
  const [players, setPlayers] = useState<Record<string, Player>>({})
  const [st, setSt] = useState<QState | null>(null)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [qr, setQr] = useState('')
  const [, setTick] = useState(0)
  const [sound, setSoundState] = useState(true)
  const [prevScores, setPrevScores] = useState<Record<string, number>>({})

  const questions = useRef<HostQ[]>(buildQuestions())
  const turnPtr = useRef<Record<TeamId, number>>({ comets: 0, rockets: 0 })
  const revealing = useRef(false)
  const round = useRef('r0')

  // refs mirror state for the timer loop
  const R = useRef({ st, answers, players })
  R.current = { st, answers, players }

  const joinUrl = `${window.location.origin}/join`

  /* ---- create room ---- */
  useEffect(() => {
    if (!liveReady() || !CLASSES[cls]) return
    let cancelled = false
    const slow = window.setTimeout(() => !cancelled && setOpenErr('The live game service is not answering.'), 15000)
    ;(async () => {
      try {
        const b = await getBackend()
        let c = newCode()
        for (let i = 0; i < 5 && (await b.get(roomPath(c) + '/meta')); i++) c = newCode()
        const m: Meta = { cls, mode, status: 'lobby', created: b.now() }
        await b.set(roomPath(c) + '/meta', m)
        window.clearTimeout(slow)
        if (cancelled) return
      setBe(b)
      setCode(c)
        QRCode.toDataURL(`${joinUrl}?room=${c}`, { margin: 1, width: 440, color: { dark: '#090B24', light: '#F8FBFF' } }).then(setQr)
      } catch (e) {
        window.clearTimeout(slow)
        if (!cancelled) setOpenErr(String((e as Error)?.message || e))
      }
    })()
    return () => {
      cancelled = true
      window.clearTimeout(slow)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- listeners ---- */
  useEffect(() => {
    if (!be || !code) return
    const u1 = be.listen(roomPath(code) + '/meta', (v) => setMeta(v))
    const u2 = be.listen(roomPath(code) + '/players', (v) => setPlayers(v || {}))
    const u3 = be.listen(roomPath(code) + '/state', (v) => setSt(v))
    return () => {
      u1()
      u2()
      u3()
    }
  }, [be, code])

  useEffect(() => {
    if (!be || !code || !st) return
    return be.listen(`${roomPath(code)}/answers/${st.round}/q${st.i}`, (v) => setAnswers(v || {}))
  }, [be, code, st?.i, st?.round])

  /* ---- auto-split teams (turn mode) ---- */
  useEffect(() => {
    if (!be || mode !== 'turn') return
    const list = sortedPlayers(players)
    const count = { comets: 0, rockets: 0 }
    list.forEach(([, p]) => p.team && count[p.team]++)
    const updates: Record<string, unknown> = {}
    list.forEach(([pid, p]) => {
      if (!p.team) {
        const t: TeamId = count.comets <= count.rockets ? 'comets' : 'rockets'
        count[t]++
        updates[`${pid}/team`] = t
      }
    })
    if (Object.keys(updates).length) be.update(roomPath(code) + '/players', updates)
  }, [players, be, code, mode])

  /* ---- sound ---- */
  useEffect(() => setSound(sound), [sound])

  /* ---- warn before closing mid-game ---- */
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (meta?.status === 'play') e.preventDefault()
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [meta?.status])

  /* ---- game flow ---- */
  const pickTurn = useCallback((team: TeamId): { team: TeamId; pid?: string; name?: string } => {
    const ps = R.current.players
    for (const t of [team, other(team)]) {
      const members = sortedPlayers(ps).filter(([, p]) => p.team === t)
      if (!members.length) continue
      const online = members.filter(([, p]) => p.online !== false)
      const pool = online.length ? online : members
      const idx = turnPtr.current[t] % pool.length
      turnPtr.current[t]++
      const [pid, p] = pool[idx]
      return { team: t, pid, name: p.name }
    }
    return { team }
  }, [])

  const ask = useCallback(
    async (i: number, teamScores: Record<TeamId, number>, shields: number, prevTeam?: TeamId) => {
      if (!be) return
      const q = questions.current[i]
      const now = be.now()
      const dur = (q.kind === 'mission' ? MISSION_SECS : BOSS_SECS) * 1000
      const s: QState = {
        i,
        round: round.current,
        total: questions.current.length,
        kind: q.kind,
        phase: 'ask',
        startAt: now,
        endAt: now + dur,
        shields,
        teamScores,
      }
      if (q.kind === 'mission') Object.assign(s, { a: q.a, b: q.b, choices: q.choices })
      else Object.assign(s, { product: q.product, ...(q.left !== undefined ? { left: q.left } : {}), ...(q.right !== undefined ? { right: q.right } : {}) })
      if (mode === 'turn') {
        const t = pickTurn(prevTeam ? other(prevTeam) : 'comets')
        s.turnTeam = t.team
        if (t.pid) {
          s.turnPid = t.pid
          s.turnName = t.name
        }
      }
      revealing.current = false
      setAnswers({})
      setPrevScores(Object.fromEntries(Object.entries(R.current.players).map(([id, p]) => [id, p.score || 0])))
      await be.set(roomPath(code) + '/state', s)
      sfx.warp()
    },
    [be, code, mode, pickTurn],
  )

  const reveal = useCallback(async () => {
    const { st: s, answers: ans, players: ps } = R.current
    if (!be || !s || s.phase !== 'ask' || revealing.current) return
    revealing.current = true
    const q = questions.current[s.i]
    const updates: Record<string, unknown> = {}
    const teamScores = { ...s.teamScores }
    let shields = s.shields
    let okCount = 0
    let answered = 0

    if (mode === 'turn') {
      const a = s.turnPid ? ans[s.turnPid] : undefined
      const ok = !!a && a.v === q.answer
      const pts = ok ? (q.kind === 'mission' ? TURN_MISSION_PTS : TURN_BOSS_PTS) : 0
      if (s.turnTeam) teamScores[s.turnTeam] += pts
      if (s.turnPid && ps[s.turnPid]) {
        const p = ps[s.turnPid]
        updates[`players/${s.turnPid}/score`] = (p.score || 0) + pts
        updates[`players/${s.turnPid}/correct`] = (p.correct || 0) + (ok ? 1 : 0)
        updates[`players/${s.turnPid}/last`] = { i: s.i, ok, pts, ...(a ? {} : { none: true }) }
      }
      if (q.kind === 'boss' && ok) shields = Math.max(0, shields - 1)
      if (ok) sfx.correct()
      else sfx.wrong()
    } else {
      Object.entries(ps).forEach(([pid, p]) => {
        const a = ans[pid]
        const ok = !!a && a.v === q.answer
        if (a) answered++
        if (ok) okCount++
        const pts = a ? racePoints(ok, a.t, s.startAt, s.endAt) : 0
        updates[`players/${pid}/score`] = (p.score || 0) + pts
        updates[`players/${pid}/correct`] = (p.correct || 0) + (ok ? 1 : 0)
        updates[`players/${pid}/last`] = { i: s.i, ok, pts, ...(a ? {} : { none: true }) }
      })
      if (q.kind === 'boss' && answered > 0 && okCount * 2 >= answered) shields = Math.max(0, shields - 1)
      sfx.correct()
    }
    updates['state/phase'] = 'reveal'
    updates['state/answer'] = q.answer
    updates['state/teamScores'] = teamScores
    updates['state/shields'] = shields
    await be.update(roomPath(code), updates)
  }, [be, code, mode])

  const finish = useCallback(async () => {
    if (!be) return
    await be.update(roomPath(code), { 'meta/status': 'end', 'state/phase': 'end' })
    sfx.victory()
  }, [be, code])

  const next = useCallback(async () => {
    const s = R.current.st
    if (!be || !s) return
    sfx.click()
    if (s.phase === 'reveal' && mode === 'race') {
      await be.update(roomPath(code), { 'state/phase': 'board' })
      return
    }
    if (s.i + 1 >= s.total) return finish()
    await ask(s.i + 1, s.teamScores, s.shields, s.turnTeam)
  }, [be, code, mode, ask, finish])

  const start = async () => {
    if (!be) return
    sfx.click()
    questions.current = buildQuestions()
    turnPtr.current = { comets: 0, rockets: 0 }
    round.current = 'r' + be.now().toString(36)
    const resets: Record<string, unknown> = { 'meta/status': 'play' }
    Object.keys(players).forEach((pid) => {
      resets[`players/${pid}/score`] = 0
      resets[`players/${pid}/correct`] = 0
      resets[`players/${pid}/last`] = null
    })
    await be.update(roomPath(code), resets)
    await ask(0, { comets: 0, rockets: 0 }, BOSS_SHIELDS)
  }

  /* ---- timer loop: end early when everyone needed has answered ---- */
  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => t + 1)
      const { st: s, answers: ans, players: ps } = R.current
      if (!be || !s || s.phase !== 'ask') return
      const now = be.now()
      const online = Object.entries(ps).filter(([, p]) => p.online !== false)
      const allIn =
        mode === 'turn' ? !!(s.turnPid && ans[s.turnPid]) || !s.turnPid : online.length > 0 && online.every(([pid]) => ans[pid])
      if (now >= s.endAt + 600 || allIn) reveal()
    }, 250)
    return () => window.clearInterval(id)
  }, [be, mode, reveal])

  /* ---- keyboard ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== 'ArrowRight') return
      const s = R.current.st
      if (!s || meta?.status !== 'play') return
      if (s.phase === 'reveal' || s.phase === 'board') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, meta?.status])

  /* ---- lobby actions ---- */
  const switchTeam = (pid: string) => {
    const p = players[pid]
    if (!be || !p) return
    sfx.click()
    be.update(roomPath(code) + '/players/' + pid, { team: other(p.team || 'rockets') })
  }
  const removePlayer = (pid: string) => be?.remove(roomPath(code) + '/players/' + pid)
  const shuffleTeams = () => {
    if (!be) return
    const ids = Object.keys(players).sort(() => Math.random() - 0.5)
    const u: Record<string, unknown> = {}
    ids.forEach((id, i) => (u[`${id}/team`] = i % 2 ? 'rockets' : 'comets'))
    be.update(roomPath(code) + '/players', u)
  }

  /* ---------------- render ---------------- */
  const stage = (children: React.ReactNode) => (
    <div className="viewport">
      <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  )

  if (!liveReady()) return stage(<SetupNeeded />)
  if (!CLASSES[cls]) return stage(<Message title="Choose a class first" text="Open live games from your teacher dashboard." />)
  if (openErr && !code)
    return stage(
      <Message
        title="Could not open a room"
        text={`${openErr} — check that the Realtime Database exists and its Rules are published, then reload this page.`}
      />,
    )
  if (!code || !meta) return stage(<Message title="Opening a room…" text="Connecting to the live game service." />)

  const plist = sortedPlayers(players)
  const onlineCount = plist.filter(([, p]) => p.online !== false).length
  const soundBtn = <SoundButton on={sound} toggle={() => setSoundState((s) => !s)} />

  /* ---- LOBBY ---- */
  if (meta.status === 'lobby') {
    const teamCol = (t: TeamId) => (
      <div className={`lobby-team team-${t}`}>
        <div className="lobby-team-head">
          {TEAMS[t].name} <span>{plist.filter(([, p]) => p.team === t).length}</span>
        </div>
        <div className="chips">
          {plist
            .filter(([, p]) => p.team === t)
            .map(([pid, p]) => (
              <PlayerChip key={pid} p={p} onClick={() => switchTeam(pid)} onRemove={() => removePlayer(pid)} title="Click to move to the other team" />
            ))}
        </div>
      </div>
    )
    return stage(
      <div className="screen live-lobby">
        <div className="nebula nebula-menu" />
        <Stars />
        <div className="lobby-planet float-slow">
          <Planet size={300} faces={false} />
        </div>
        <div className="glass join-card">
          <Bolts />
          <div className="eyebrow">
            LIVE · CLASS {cls} · {mode === 'turn' ? 'TEAM TURNS' : 'RACE'}
          </div>
          <h1 className="title join-title">JOIN ON YOUR PHONE</h1>
          <div className="join-steps">
            <div>
              <small>1 · Open</small>
              <b className="join-url">{joinUrl.replace(/^https?:\/\//, '')}</b>
            </div>
            <div>
              <small>2 · Enter code</small>
              <b className="join-code">{code}</b>
            </div>
          </div>
          {qr && (
            <div className="qr-wrap">
              <img src={qr} alt={`QR code to join room ${code}`} width={200} height={200} />
              <span>or scan with your phone camera</span>
            </div>
          )}
        </div>

        <div className="glass roster-card">
          <Bolts />
          <div className="roster-head">
            <div>
              <div className="eyebrow">PILOTS JOINED</div>
              <div className="joined-count">
                {plist.length}
                <span> / {CLASSES[cls].length}</span>
              </div>
            </div>
            {mode === 'turn' && plist.length > 1 && (
              <button className="btn btn-ghost btn-sm" onClick={shuffleTeams}>
                SHUFFLE TEAMS
              </button>
            )}
          </div>
          {plist.length === 0 ? (
            <div className="waiting">
              <span className="spinner" /> Waiting for students to join…
            </div>
          ) : mode === 'turn' ? (
            <div className="lobby-teams">
              {teamCol('comets')}
              {teamCol('rockets')}
            </div>
          ) : (
            <div className="chips race-chips">
              {plist.map(([pid, p]) => (
                <PlayerChip key={pid} p={p} onRemove={() => removePlayer(pid)} />
              ))}
            </div>
          )}
          <div className="lobby-foot">
            <span className="muted-note">{mode === 'turn' ? 'Tap a name to move it to the other team. × removes a player.' : 'Everyone answers every question. Faster right answers score more.'}</span>
            <button className="btn btn-primary btn-lg" onClick={start} disabled={plist.length < (mode === 'turn' ? 2 : 1)}>
              <Icon name="rocket" size={30} /> START
            </button>
          </div>
        </div>
      </div>,
    )
  }

  if (!st) return stage(<Message title="Starting…" text="" />)

  /* ---- END ---- */
  if (meta.status === 'end' || st.phase === 'end') {
    return stage(<HostEnd mode={mode} st={st} players={players} onAgain={start} soundBtn={soundBtn} />)
  }

  /* ---- LEADERBOARD (race) ---- */
  if (st.phase === 'board') {
    const top = Object.entries(players)
      .sort((a, b) => (b[1].score || 0) - (a[1].score || 0))
      .slice(0, 8)
    return stage(
      <div className="screen live-board">
        <div className="nebula nebula-mission" />
        <Stars count={100} seed={4} />
        <div className="hud-right">{soundBtn}</div>
        <div className="board-head">
          <div className="eyebrow">AFTER QUESTION {st.i + 1} OF {st.total}</div>
          <h1 className="title board-title">LEADERBOARD</h1>
        </div>
        <div className="board-list">
          {top.map(([pid, p], i) => {
            const gain = (p.score || 0) - (prevScores[pid] || 0)
            return (
              <div key={pid} className={`board-row r${i + 1}`} style={{ animationDelay: `${i * 60}ms` }}>
                <span className="b-rank">{i + 1}</span>
                <span className="b-name" dir="auto">
                  {p.name}
                </span>
                {gain > 0 && <span className="b-gain">+{fmt(gain)}</span>}
                <span className="b-score">{fmt(p.score || 0)}</span>
              </div>
            )
          })}
        </div>
        <div className="teacher-controls">
          <button className="btn btn-primary btn-next" onClick={next}>
            {st.i + 1 >= st.total ? 'SEE WINNERS' : 'NEXT QUESTION'} <span className="arrow">→</span>
          </button>
        </div>
      </div>,
    )
  }

  /* ---- QUESTION (ask / reveal) ---- */
  const q = questions.current[st.i]
  const isBoss = st.kind === 'boss'
  const now = be ? be.now() : Date.now()
  const total = (st.endAt - st.startAt) / 1000
  const left = Math.max(0, Math.ceil((st.endAt - now) / 1000))
  const timerColor = left > 8 ? 'cyan' : left > 3 ? 'orange' : 'coral'
  const C = 2 * Math.PI * 44
  const answeredIds = Object.keys(answers)
  const revealed = st.phase === 'reveal'
  const counts: Record<number, number> = {}
  answeredIds.forEach((id) => (counts[answers[id].v] = (counts[answers[id].v] || 0) + 1))
  const turnAns = st.turnPid ? answers[st.turnPid] : undefined
  const turnOk = !!turnAns && turnAns.v === st.answer

  let fastest: { name: string; secs: number } | null = null
  if (revealed && mode === 'race') {
    answeredIds.forEach((id) => {
      const a = answers[id]
      if (a.v === st.answer && players[id]) {
        const secs = (a.t - st.startAt) / 1000
        if (!fastest || secs < fastest.secs) fastest = { name: players[id].name, secs }
      }
    })
  }
  const okCount = answeredIds.filter((id) => answers[id].v === st.answer).length
  const label = isBoss ? `BOSS ${st.i - MISSIONS + 1} / ${BOSS_SHIELDS}` : `MISSION ${String(st.i + 1).padStart(2, '0')} / ${String(MISSIONS).padStart(2, '0')}`
  const fastestText = fastest ? `${(fastest as { name: string; secs: number }).name} (${(fastest as { name: string; secs: number }).secs.toFixed(1)}s)` : ''

  return stage(
    <div className={`screen mission ${isBoss ? 'live-boss' : ''}`}>
      <div className={`nebula ${isBoss ? 'nebula-boss' : 'nebula-mission'}`} />
      <Stars count={110} seed={21} />
      {!isBoss && (
        <div className="asteroid-field">
          <div className="ast a1"><Asteroid size={70} rot={10} /></div>
          <div className="ast a3"><Asteroid size={90} rot={200} /></div>
          <div className="ast a5"><Asteroid size={56} rot={300} /></div>
        </div>
      )}
      <div className="mission-ship">
        <Ship width={150} />
      </div>

      <div className="hud-left">
        <div className="hud-heading">
          {label.split(' ')[0]} <b>{label.split(' ')[1]}</b> {label.split(' ').slice(2).join(' ')}
        </div>
        <div className="progress">
          {Array.from({ length: st.total }, (_, i) => (
            <span key={i} className={`${i < st.i ? 'done' : i === st.i ? 'now' : ''} ${i >= MISSIONS ? 'boss-seg' : ''}`} />
          ))}
        </div>
      </div>
      <div className={`timer timer-${timerColor} ${revealed ? 'stopped' : ''}`}>
        <svg viewBox="0 0 104 104" width="104" height="104">
          <circle cx="52" cy="52" r="44" className="timer-track" />
          <circle cx="52" cy="52" r="44" className="timer-fill" strokeDasharray={C} strokeDashoffset={C * (1 - left / total)} transform="rotate(-90 52 52)" />
        </svg>
        <span>{revealed ? '✓' : left}</span>
      </div>
      <div className="hud-right">
        {mode === 'race' && (
          <div className="answered-pill">
            <b>{answeredIds.length}</b> / {onlineCount} answered
          </div>
        )}
        {soundBtn}
      </div>

      {/* score rail */}
      <div className="score-rail">
        {mode === 'turn' ? (
          <>
            <TeamCard team="comets" score={st.teamScores.comets} active={st.turnTeam === 'comets'} />
            <div className={`turn-banner team-${st.turnTeam}`}>
              <small>{st.turnTeam ? TEAMS[st.turnTeam].name : ''}</small>
              <b dir="auto">{st.turnName ? `${st.turnName}'s turn` : 'No players'}</b>
            </div>
            <TeamCard team="rockets" score={st.teamScores.rockets} active={st.turnTeam === 'rockets'} />
          </>
        ) : (
          <div className="race-strip">
            <span>RACE · answer on your phone</span>
          </div>
        )}
      </div>

      {/* question */}
      <div key={st.i} className="glass question-card pop-in">
        {isBoss ? (
          <>
            <div className="q-label violet">
              CAPTAIN NULL · MISSING FACTOR ·{' '}
              <span className="shield-pips">
                {Array.from({ length: BOSS_SHIELDS }, (_, i) => (
                  <i key={i} className={i < st.shields ? 'on' : ''} />
                ))}
              </span>
            </div>
            <div className="equation">
              {st.left !== undefined ? fmt(st.left) : <span className="q-mark">{revealed ? fmt(q.answer) : '?'}</span>} ×{' '}
              {st.right !== undefined ? fmt(st.right) : <span className="q-mark">{revealed ? fmt(q.answer) : '?'}</span>} = {fmt(st.product || 0)}
            </div>
          </>
        ) : (
          <>
            <div className="q-label">POWER MULTIPLIER</div>
            <div className="equation">
              {fmt(st.a || 0)} × {fmt(st.b || 0)} = <span className="q-mark">{revealed ? fmt(q.answer) : '?'}</span>
            </div>
          </>
        )}
        <div className="q-sub">{revealed && q.worked ? <span className="worked">{q.worked}</span> : <span className="cue">Answer on your phone!</span>}</div>
      </div>

      {/* answers / boss panel */}
      {!isBoss ? (
        <div className="answers">
          {(st.choices || []).map((c, i) => {
            let cls2 = ''
            if (revealed) cls2 = c === q.answer ? 'correct' : mode === 'turn' && turnAns?.v === c ? 'incorrect' : 'dim'
            return (
              <div key={`${st.i}-${c}`} className={`answer static ${cls2}`}>
                <span className="letter">{'ABCD'[i]}</span>
                <span className="answer-num">{fmt(c)}</span>
                {revealed && mode === 'race' && <span className="count-pill">{counts[c] || 0}</span>}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="boss-panel">
          <div className="boss-panel-art">
            <CaptainNull width={250} hit={revealed && (mode === 'turn' ? turnOk : okCount * 2 >= Math.max(1, answeredIds.length))} />
          </div>
          <div className="boss-panel-text">
            {!revealed ? (
              <>
                <b>Type the missing number on your phone</b>
                <span>Drop the zeros, then divide.</span>
              </>
            ) : mode === 'turn' ? (
              <b className={turnOk ? 'ok' : 'bad'}>{turnOk ? 'SHIELD DOWN!' : `The missing number is ${fmt(q.answer)}`}</b>
            ) : (
              <>
                <b className={okCount * 2 >= Math.max(1, answeredIds.length) && answeredIds.length ? 'ok' : 'bad'}>
                  {okCount} of {answeredIds.length} correct{okCount * 2 >= Math.max(1, answeredIds.length) && answeredIds.length ? ' · SHIELD DOWN!' : ' · the shield holds!'}
                </b>
                <span>Missing number: {fmt(q.answer)}</span>
              </>
            )}
          </div>
        </div>
      )}

      {revealed && mode === 'turn' && (
        <div className={`feedback-banner ${turnOk ? 'fb-correct' : 'fb-wrong'}`}>
          {turnOk ? (
            <>
              +{isBoss ? TURN_BOSS_PTS : TURN_MISSION_PTS} for {st.turnTeam ? TEAMS[st.turnTeam].short : ''} · well done, <span dir="auto">{st.turnName}</span>!
            </>
          ) : turnAns ? (
            <>Not quite — the answer is {fmt(q.answer)}</>
          ) : (
            <>Time's up! The answer is {fmt(q.answer)}</>
          )}
        </div>
      )}

      <div className="live-foot-left">
        {revealed && mode === 'race' ? (
          <span>
            {okCount} of {answeredIds.length} correct{fastestText && <> · fastest: <b dir="auto">{fastestText}</b></>}
          </span>
        ) : !revealed && mode === 'turn' && st.turnPid && players[st.turnPid]?.online === false ? (
          <span className="warn">This student looks offline — press Reveal to skip.</span>
        ) : null}
      </div>

      <div className="teacher-controls">
        {!revealed ? (
          <button className="btn btn-outline" onClick={reveal}>
            REVEAL NOW
          </button>
        ) : (
          <button className="btn btn-primary btn-next" onClick={next}>
            {mode === 'race' ? 'LEADERBOARD' : st.i + 1 >= st.total ? 'FINISH' : 'NEXT'} <span className="arrow">→</span>
          </button>
        )}
      </div>
    </div>,
  )
}

function PlayerChip({ p, onClick, onRemove, title }: { p: Player; onClick?: () => void; onRemove?: () => void; title?: string }) {
  return (
    <span className={`pchip ${p.online === false ? 'off' : ''} ${p.team ? 'team-' + p.team : ''}`}>
      <button className="pchip-name" onClick={onClick} title={title} dir="auto" disabled={!onClick}>
        {p.name}
      </button>
      {onRemove && (
        <button className="pchip-x" onClick={onRemove} aria-label={`Remove ${p.name}`}>
          ×
        </button>
      )}
    </span>
  )
}

function HostEnd({ mode, st, players, onAgain, soundBtn }: { mode: LiveMode; st: QState; players: Record<string, Player>; onAgain: () => void; soundBtn: React.ReactNode }) {
  const ranked = Object.entries(players).sort((a, b) => (b[1].score || 0) - (a[1].score || 0))
  const won = st.shields <= 0
  return (
    <div className="screen victory">
      <div className="nebula nebula-victory" />
      <Stars count={120} seed={11} />
      <div className="portal" />
      <div className="victory-ship">
        <Ship width={220} />
      </div>
      <div className="hud-right">{soundBtn}</div>
      <div className="victory-head live-end-head">
        <div className="eyebrow yellow">{won ? 'GALAXY SAVED! CAPTAIN NULL IS DEFEATED' : `CAPTAIN NULL ESCAPED WITH ${st.shields} SHIELD${st.shields === 1 ? '' : 'S'}`}</div>
        <h1 className="title victory-title">MISSION COMPLETE</h1>
      </div>

      {mode === 'turn' ? (
        <div className="glass podium live-podium">
          <Bolts />
          {(['comets', 'rockets'] as TeamId[])
            .sort((a, b) => st.teamScores[b] - st.teamScores[a])
            .map((t, i) => {
              const tie = st.teamScores.comets === st.teamScores.rockets
              const members = ranked.filter(([, p]) => p.team === t)
              return (
                <div key={t} className={`rank-row team-${t} ${i === 0 || tie ? 'winner' : ''} tall`}>
                  <span className="rank-num">{tie ? 1 : i + 1}</span>
                  <span className="rank-icon">{i === 0 || tie ? <Icon name="crown" size={30} /> : <Icon name="medal" size={30} />}</span>
                  <span className="rank-name">
                    {TEAMS[t].name}
                    <small dir="auto">{members.map(([, p]) => p.name).join(' · ')}</small>
                  </span>
                  <span className="rank-pts">{fmt(st.teamScores[t])} PTS</span>
                </div>
              )
            })}
          {ranked[0] && (ranked[0][1].score || 0) > 0 && (
            <div className="reinforce">
              Star pilot: <b dir="auto">{ranked[0][1].name}</b> · {fmt(ranked[0][1].score)} pts
            </div>
          )}
        </div>
      ) : (
        <div className="race-final">
          <div className="race-top3">
            {[1, 0, 2].map((idx) =>
              ranked[idx] ? (
                <div key={idx} className={`step step-${idx + 1}`}>
                  <span className="step-name" dir="auto">
                    {ranked[idx][1].name}
                  </span>
                  <span className="step-pts">{fmt(ranked[idx][1].score || 0)}</span>
                  <div className="step-block">{idx + 1}</div>
                </div>
              ) : (
                <div key={idx} className="step empty" />
              ),
            )}
          </div>
          <div className="race-rest">
            {ranked.slice(3).map(([pid, p], i) => (
              <span key={pid} className="rest-row">
                <b>{i + 4}</b> <span dir="auto">{p.name}</span> <em>{fmt(p.score || 0)}</em>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="live-end-ctas">
        <button className="btn btn-primary btn-lg" onClick={onAgain}>
          <Icon name="rocket" size={30} /> PLAY AGAIN
        </button>
        <button className="btn btn-outline" onClick={() => (window.location.href = '/teacher')}>
          BACK TO DASHBOARD
        </button>
      </div>
    </div>
  )
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="screen">
      <div className="nebula nebula-menu" />
      <Stars />
      <div className="center-msg">
        <h1 className="title picker-title">{title}</h1>
        {text && <p>{text}</p>}
      </div>
    </div>
  )
}

function SetupNeeded() {
  return (
    <div className="screen">
      <div className="nebula nebula-menu" />
      <Stars />
      <div className="center-msg">
        <h1 className="title picker-title">LIVE GAMES NEED SETUP</h1>
        <p>Connect Firebase first (send the setup details to Claude). Then come back here from your dashboard.</p>
        <IconButton label="Back to dashboard" icon="back" onClick={() => (window.location.href = '/teacher')} />
      </div>
    </div>
  )
}
