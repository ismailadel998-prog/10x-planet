import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  BOSS_POINTS,
  BOSS_SHIELDS,
  MISSION_POINTS,
  MISSION_SECONDS,
  MISSIONS,
  SKILLS,
  TEAMS,
  fmt,
  lessonBossQs,
  makeBossQ,
  makeMissions,
  other,
  workedSteps,
  type BossQ,
  type MissionQ,
  type TeamId,
} from './game'
import { Asteroid, CaptainNull, Chest, Crystal, Icon, Planet, Ship, Sparkle, Stars } from './art'
import { setSound, sfx } from './sound'
import { CLASSES, CLASS_IDS, isArabic } from './roster'
import { checkPlayed, connected, finishAttempt, resendPending, startAttempt, type Rec } from './api'

type Screen = 'menu' | 'class' | 'name' | 'mission' | 'boss' | 'victory' | 'solo-results'
type Mode = 'team' | 'solo'
type Scores = Record<TeamId, number>

const HINTS_PER_TEAM = 2
const SOLO_SECONDS = 30

/* ---------- Stage: fixed 1440×900 canvas scaled to fit any screen ---------- */
export function useStageScale() {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1440, window.innerHeight / 900))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return scale
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/* ---------- Small reusable components ---------- */
export function IconButton({ label, icon, onClick }: { label: string; icon: Parameters<typeof Icon>[0]['name']; onClick: () => void }) {
  return (
    <button className="icon-btn" onClick={onClick} aria-label={label} data-tip={label}>
      <Icon name={icon} />
    </button>
  )
}

export function SoundButton({ on, toggle }: { on: boolean; toggle: () => void }) {
  return <IconButton label={on ? 'Sound on' : 'Sound off'} icon={on ? 'sound' : 'mute'} onClick={toggle} />
}

export function Bolts() {
  return (
    <>
      <i className="bolt tl" />
      <i className="bolt tr" />
      <i className="bolt bl" />
      <i className="bolt br" />
    </>
  )
}

export function Meter({ label, value, max, segments = 10 }: { label: ReactNode; value: number; max: number; segments?: number }) {
  const lit = Math.round((value / max) * segments)
  return (
    <div className="meter meter-fuel">
      <div className="meter-label">{label}</div>
      <div className="meter-track">
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className={i < lit ? 'seg on' : 'seg'} />
        ))}
      </div>
    </div>
  )
}

function HintPips({ hints }: { hints: number }) {
  return (
    <div className="powerups" aria-label={`${hints} hints left`}>
      {Array.from({ length: HINTS_PER_TEAM }, (_, i) => (
        <span key={i} className={i < hints ? 'pu on' : 'pu'}>
          <Icon name="crystal" size={16} />
        </span>
      ))}
    </div>
  )
}

export function TeamCard({ team, score, active, compact, hints }: { team: TeamId; score: number; active: boolean; compact?: boolean; hints?: number }) {
  return (
    <div className={`team-card team-${team} ${active ? 'active' : ''} ${compact ? 'compact' : ''}`}>
      <div className="team-avatar">
        <svg viewBox="0 0 40 40" width="44" height="44" aria-hidden>
          {team === 'comets' ? (
            <>
              <path d="M6 34 L22 18" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.5" />
              <circle cx="26" cy="14" r="9" fill="currentColor" stroke="#2A1660" strokeWidth="3" />
            </>
          ) : (
            <path d="M12 28 C12 16 20 6 20 6 C20 6 28 16 28 28Z M14 28 L8 34 L14 32Z M26 28 L32 34 L26 32Z" fill="currentColor" stroke="#2A1660" strokeWidth="2.5" strokeLinejoin="round" />
          )}
        </svg>
        {active && <span className="orbit" />}
      </div>
      <div className="team-info">
        <div className="team-name">{TEAMS[team].name}</div>
        <div className="team-score">{fmt(score)}</div>
        {hints !== undefined && <HintPips hints={hints} />}
      </div>
      {active && <div className="turn-tag">YOUR TURN</div>}
    </div>
  )
}

/** Solo player HUD card */
function PlayerCard({ name, cls, score, hints, compact }: { name: string; cls: string; score: number; hints?: number; compact?: boolean }) {
  return (
    <div className={`team-card team-comets active player-card ${compact ? 'compact' : ''}`}>
      <div className="team-avatar">
        <Icon name="rocket" size={30} />
        <span className="orbit" />
      </div>
      <div className="team-info">
        <div className="team-name">
          PILOT · {cls}
        </div>
        <div className="player-name" dir="auto">
          {name}
        </div>
        {hints !== undefined && <HintPips hints={hints} />}
      </div>
      <div className="player-score">
        <small>SCORE</small>
        <b>{fmt(score)}</b>
      </div>
    </div>
  )
}

export function Overlay({ children, onClose, wide }: { children: ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`glass modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <Bolts />
        {children}
      </div>
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="hud-back">
      <IconButton label="Back" icon="back" onClick={onClick} />
    </div>
  )
}

/* ---------- Screen 01: Main Menu ---------- */
function MainMenu({ onSolo, onHowTo }: { onSolo: () => void; onHowTo: () => void }) {
  return (
    <div className="screen menu">
      <div className="nebula nebula-menu" />
      <Stars />
      <div className="menu-planet float-slow">
        <Planet size={640} />
      </div>
      <div className="menu-ship fly-in">
        <Ship width={380} />
      </div>
      <div className="asteroid-trail">
        <Asteroid size={34} rot={20} />
        <Asteroid size={22} rot={80} />
        <Asteroid size={14} rot={140} />
      </div>

      <div className="title-block">
        <div className="eyebrow">GRADE 4 • MULTIPLICATION MISSION</div>
        <h1 className="title">
          ESCAPE THE
          <br />
          <span className="title-10x">10X</span> PLANET!
        </h1>
      </div>

      <div className="glass mission-card">
        <Bolts />
        <p className="story">Your ship is stuck on Planet 10X! Multiply by multiples of 10 to power the ship. Beat Captain Null. Escape!</p>
        <button className="btn btn-primary btn-lg" onClick={onSolo}>
          <Icon name="rocket" size={30} /> START MY MISSION
        </button>
        <button className="btn btn-outline" onClick={onHowTo}>
          HOW TO PLAY
        </button>
        <a className="btn btn-ghost join-live-btn" href="/join">
          JOIN A LIVE GAME
        </a>
      </div>
    </div>
  )
}

/* ---------- Solo: pick class ---------- */
function ClassPick({ onPick, onBack }: { onPick: (c: string) => void; onBack: () => void }) {
  return (
    <div className="screen picker">
      <div className="nebula nebula-menu" />
      <Stars seed={5} />
      <BackButton onClick={onBack} />
      <div className="picker-head">
        <div className="eyebrow">STEP 1 OF 2</div>
        <h1 className="title picker-title">WHICH CLASS ARE YOU IN?</h1>
      </div>
      <div className="class-cards">
        {CLASS_IDS.map((c, i) => (
          <button
            key={c}
            className={`class-card ${i % 2 ? 'orange' : 'cyan'}`}
            onClick={() => {
              sfx.click()
              onPick(c)
            }}
          >
            <span className="class-grade">GRADE</span>
            <span className="class-id">{c}</span>
            <span className="class-count">{CLASSES[c].length} pilots</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------- Solo: pick name ---------- */
function NamePick({ cls, onBack, onConfirm }: { cls: string; onBack: () => void; onConfirm: (name: string) => void }) {
  const [chosen, setChosen] = useState<string | null>(null)
  const [checking, setChecking] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const names = CLASSES[cls] || []

  const tap = async (name: string) => {
    if (checking) return
    sfx.click()
    setChecking(name)
    const played = await checkPlayed(cls, name)
    setChecking(null)
    if (played) setBlocked(name)
    else setChosen(name)
  }

  const go = async () => {
    if (!chosen || starting) return
    setStarting(true)
    const ok = await startAttempt(cls, chosen)
    setStarting(false)
    if (!ok) {
      setBlocked(chosen)
      setChosen(null)
      return
    }
    onConfirm(chosen)
  }

  return (
    <div className="screen picker">
      <div className="nebula nebula-menu" />
      <Stars seed={9} />
      <BackButton onClick={onBack} />
      <div className="picker-head small">
        <div className="eyebrow">STEP 2 OF 2 · CLASS {cls}</div>
        <h1 className="title picker-title">TAP YOUR NAME</h1>
      </div>
      <div className="name-grid">
        {names.map((n) => (
          <button key={n} className={`name-btn ${isArabic(n) ? 'ar' : ''}`} dir="auto" onClick={() => tap(n)} disabled={!!checking}>
            {checking === n ? <span className="spinner" /> : n}
          </button>
        ))}
      </div>

      {chosen && (
        <Overlay onClose={() => !starting && setChosen(null)}>
          <div className="eyebrow">CLASS {cls}</div>
          <h2 className="modal-title center">
            Are you{' '}
            <span className="hl" dir="auto">
              {chosen}
            </span>
            ?
          </h2>
          <p className="modal-text">You can play this mission one time. Get ready!</p>
          <div className="modal-actions row">
            <button className="btn btn-outline" onClick={() => setChosen(null)} disabled={starting}>
              NO, GO BACK
            </button>
            <button className="btn btn-primary" onClick={go} disabled={starting}>
              {starting ? 'LOADING…' : 'YES, START!'}
            </button>
          </div>
        </Overlay>
      )}

      {blocked && (
        <Overlay onClose={() => setBlocked(null)}>
          <h2 className="modal-title center">Mission already played</h2>
          <p className="modal-text">
            <span dir="auto">{blocked}</span> has already played this mission. If you need another try, ask your teacher.
          </p>
          <button className="btn btn-primary" onClick={() => setBlocked(null)}>
            OK
          </button>
        </Overlay>
      )}
    </div>
  )
}

/* ---------- Screen 02: Mission Gameplay ---------- */
type Phase = 'ask' | 'locked' | 'feedback'
type Result = 'correct' | 'wrong' | 'timeout' | 'revealed'

interface PlayProps {
  mode: Mode
  player: { cls: string; name: string } | null
  turn: TeamId
  setTurn: (t: TeamId) => void
  scores: Scores
  addPoints: (t: TeamId, n: number) => void
  paused: boolean
  onPause: () => void
  sound: boolean
  toggleSound: () => void
  onRecord: (r: Rec) => void
  runId: number
}

function Mission(props: PlayProps & { onDone: (correct: number) => void }) {
  const { mode, player, turn, setTurn, scores, addPoints, paused, onPause, sound, toggleSound, onDone, onRecord, runId } = props
  const solo = mode === 'solo'
  const seconds = solo ? SOLO_SECONDS : MISSION_SECONDS
  const [missions, setMissions] = useState<MissionQ[]>(() => makeMissions())
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('ask')
  const [selected, setSelected] = useState<number | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [time, setTime] = useState(seconds)
  const [correctCount, setCorrectCount] = useState(0)
  const [fuelPulse, setFuelPulse] = useState(false)
  const [showCue, setShowCue] = useState(false)

  useEffect(() => {
    setMissions(makeMissions())
    setIdx(0)
    setPhase('ask')
    setSelected(null)
    setResult(null)
    setTime(seconds)
    setCorrectCount(0)
    setShowCue(false)
  }, [runId, seconds])

  const q = missions[idx]
  const qText = q ? `${fmt(q.a)} × ${fmt(q.b)}` : ''

  // countdown
  useEffect(() => {
    if (phase !== 'ask' || paused) return
    if (time <= 0) {
      setResult('timeout')
      setPhase('feedback')
      sfx.wrong()
      onRecord({ kind: 'mission', skill: q.skill, q: qText, answer: null, correct: q.answer, ok: false })
      return
    }
    const id = window.setTimeout(() => {
      setTime((t) => t - 1)
      if (time <= 4) sfx.tick()
    }, 1000)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, paused, time])

  const choose = useCallback(
    (choice: number) => {
      if (phase !== 'ask' || paused) return
      sfx.lock()
      setSelected(choice)
      setPhase('locked')
      window.setTimeout(() => {
        const ok = choice === q.answer
        setResult(ok ? 'correct' : 'wrong')
        setPhase('feedback')
        onRecord({ kind: 'mission', skill: q.skill, q: qText, answer: choice, correct: q.answer, ok })
        if (ok) {
          sfx.correct()
          addPoints(turn, MISSION_POINTS)
          setCorrectCount((c) => c + 1)
          setFuelPulse(true)
          window.setTimeout(() => setFuelPulse(false), 900)
        } else sfx.wrong()
      }, 650)
    },
    [phase, paused, q, qText, turn, addPoints, onRecord],
  )

  const reveal = () => {
    if (phase !== 'ask') return
    setResult('revealed')
    setPhase('feedback')
    onRecord({ kind: 'mission', skill: q.skill, q: qText, answer: null, correct: q.answer, ok: false })
  }

  const next = useCallback(() => {
    if (phase !== 'feedback') return
    sfx.click()
    if (idx + 1 >= MISSIONS) {
      onDone(correctCount)
      return
    }
    setIdx((i) => i + 1)
    setPhase('ask')
    setSelected(null)
    setResult(null)
    setTime(seconds)
    setShowCue(false)
    if (!solo) setTurn(other(turn))
  }, [phase, idx, correctCount, onDone, setTurn, turn, seconds, solo])

  // keyboard: 1-4 / A-D to answer, Enter for next
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused) return
      const k = e.key.toLowerCase()
      const map: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 }
      if (k in map && q) choose(q.choices[map[k]])
      if (k === 'enter' || k === 'arrowright') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [choose, next, paused, q])

  if (!q) return null
  const fuel = Math.min(100, 20 + correctCount * 10)
  const timerColor = time > 8 ? 'cyan' : time > 3 ? 'orange' : 'coral'
  const C = 2 * Math.PI * 44

  return (
    <div className="screen mission">
      <div className="nebula nebula-mission" />
      <Stars count={110} seed={21} />
      <div className="asteroid-field">
        <div className="ast a1"><Asteroid size={70} rot={10} /></div>
        <div className="ast a2"><Asteroid size={44} rot={70} /></div>
        <div className="ast a3"><Asteroid size={90} rot={200} /></div>
        <div className="ast a4"><Asteroid size={36} rot={120} /></div>
        <div className="ast a5"><Asteroid size={56} rot={300} /></div>
      </div>
      <div className="mission-ship">
        <Ship width={150} />
        <div className="shield-trail" />
      </div>

      {/* Top HUD */}
      <div className="hud-left">
        <div className="hud-heading">
          MISSION <b>{pad2(idx + 1)}</b> / {pad2(MISSIONS)}
        </div>
        <div className="progress">
          {Array.from({ length: MISSIONS }, (_, i) => (
            <span key={i} className={i < idx ? 'done' : i === idx ? 'now' : ''} />
          ))}
        </div>
      </div>
      <div className={`timer timer-${timerColor} ${phase !== 'ask' ? 'stopped' : ''}`} aria-label={`${time} seconds left`}>
        <svg viewBox="0 0 104 104" width="104" height="104">
          <circle cx="52" cy="52" r="44" className="timer-track" />
          <circle cx="52" cy="52" r="44" className="timer-fill" strokeDasharray={C} strokeDashoffset={C * (1 - time / seconds)} transform="rotate(-90 52 52)" />
        </svg>
        <span>{time}</span>
      </div>
      <div className="hud-right">
        <SoundButton on={sound} toggle={toggleSound} />
        <IconButton label="Pause" icon="pause" onClick={onPause} />
      </div>

      {/* Score rail */}
      <div className={`score-rail ${solo ? 'solo' : ''}`}>
        {solo && player ? (
          <PlayerCard name={player.name} cls={player.cls} score={scores.comets} />
        ) : (
          <>
            <TeamCard team="comets" score={scores.comets} active={turn === 'comets'} />
            <TeamCard team="rockets" score={scores.rockets} active={turn === 'rockets'} />
          </>
        )}
      </div>

      {/* Question */}
      <div key={idx} className="glass question-card pop-in">
        <div className="q-label">POWER MULTIPLIER</div>
        <div className="equation">
          {fmt(q.a)} × {fmt(q.b)} = <span className="q-mark">{phase === 'feedback' ? fmt(q.answer) : '?'}</span>
        </div>
        <div className="q-sub">
          {phase === 'feedback' ? (
            <span className="worked">{workedSteps(q)}</span>
          ) : showCue ? (
            <span className="cue">{q.cue}</span>
          ) : (
            <button className="link-btn" onClick={() => setShowCue(true)}>
              Show strategy cue
            </button>
          )}
        </div>
      </div>

      {/* Answers */}
      <div className="answers">
        {q.choices.map((c, i) => {
          const letter = 'ABCD'[i]
          let state = ''
          if (phase === 'locked' && c === selected) state = 'selected'
          if (phase === 'feedback') {
            if (c === q.answer) state = selected === c ? 'correct' : 'correct-rim'
            else if (c === selected) state = 'incorrect'
            else state = 'dim'
          }
          return (
            <button key={`${idx}-${c}`} className={`answer ${state}`} onClick={() => choose(c)} disabled={phase !== 'ask'} aria-label={`Answer ${letter}: ${fmt(c)}`}>
              <span className="letter">{letter}</span>
              <span className="answer-num">{fmt(c)}</span>
              {state === 'selected' && <span className="locked-pill">LOCKED IN</span>}
              {(state === 'correct' || state === 'correct-rim') && (
                <span className="badge badge-ok">
                  <Icon name="check" size={22} />
                </span>
              )}
              {state === 'incorrect' && (
                <span className="badge badge-bad">
                  <Icon name="x" size={22} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Feedback banner */}
      {phase === 'feedback' && (
        <div className={`feedback-banner fb-${result}`}>
          {result === 'correct' && <>+{MISSION_POINTS} FUEL POINTS{solo ? '!' : ` · ${TEAMS[turn].short}!`}</>}
          {result === 'wrong' && <>Not quite — the answer is {fmt(q.answer)}</>}
          {result === 'timeout' && <>Time's up! The answer is {fmt(q.answer)}</>}
          {result === 'revealed' && <>Answer: {fmt(q.answer)}</>}
        </div>
      )}

      {/* Bottom bar */}
      <div className={`fuel-wrap ${fuelPulse ? 'pulse' : ''}`}>
        <Meter
          label={
            <>
              SHIP FUEL <b>{fuel}%</b>
            </>
          }
          value={fuel}
          max={100}
        />
      </div>
      <div className="teacher-controls">
        {!solo && (
          <button className="link-btn" onClick={reveal} disabled={phase !== 'ask'}>
            Reveal answer
          </button>
        )}
        <button className="btn btn-primary btn-next" onClick={next} disabled={phase !== 'feedback'}>
          {idx + 1 >= MISSIONS ? 'FACE THE BOSS' : 'NEXT MISSION'} <span className="arrow">→</span>
        </button>
      </div>
    </div>
  )
}

/* ---------- Screen 03: Final Boss ---------- */
function Boss(props: PlayProps & { onFinish: (shieldsLeft: number, correct: number, hintsUsed: number) => void }) {
  const { mode, player, turn, setTurn, scores, addPoints, paused, onPause, sound, toggleSound, onFinish, onRecord, runId } = props
  const solo = mode === 'solo'
  const [queue, setQueue] = useState<BossQ[]>(() => lessonBossQs())
  const [asked, setAsked] = useState(1)
  const [shields, setShields] = useState(BOSS_SHIELDS)
  const [correct, setCorrect] = useState(0)
  const [value, setValue] = useState('')
  const [hintOpen, setHintOpen] = useState(false)
  const [hints, setHints] = useState<Record<TeamId, number>>({ comets: HINTS_PER_TEAM, rockets: HINTS_PER_TEAM })
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null)
  const [hit, setHit] = useState(false)
  const [shake, setShake] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setQueue(lessonBossQs())
    setAsked(1)
    setShields(BOSS_SHIELDS)
    setCorrect(0)
    setValue('')
    setHintOpen(false)
    setHints({ comets: HINTS_PER_TEAM, rockets: HINTS_PER_TEAM })
    setResult(null)
  }, [runId])

  const q = queue[0]
  // Solo: everyone gets the same 5 lesson questions, then the game ends.
  const lastQuestion = solo ? asked >= BOSS_SHIELDS : false

  useEffect(() => {
    if (!result && !paused) inputRef.current?.focus()
  }, [q, result, paused])

  const submit = () => {
    if (result || paused || value.trim() === '') return
    const n = Number(value.replace(/,/g, ''))
    const ok = n === q.answer
    const qText = `${q.left === null ? '?' : fmt(q.left)} × ${q.right === null ? '?' : fmt(q.right)} = ${fmt(q.product)}`
    onRecord({ kind: 'boss', skill: SKILLS.missing, q: qText, answer: n, correct: q.answer, ok, hint: hintOpen })
    if (ok) {
      sfx.shield()
      setResult('correct')
      setShields((s) => s - 1)
      setCorrect((c) => c + 1)
      addPoints(turn, BOSS_POINTS)
      setHit(true)
      window.setTimeout(() => setHit(false), 700)
    } else {
      sfx.wrong()
      setResult('wrong')
      setShake(true)
      window.setTimeout(() => setShake(false), 500)
    }
  }

  const hintsUsed = HINTS_PER_TEAM * 2 - hints.comets - hints.rockets
  const finished = shields <= 0 || lastQuestion

  const next = () => {
    if (!result) return
    sfx.click()
    if (finished) {
      onFinish(shields, correct, hintsUsed)
      return
    }
    setQueue((qs) => {
      const rest = qs.slice(1)
      return rest.length ? rest : [makeBossQ()]
    })
    setAsked((a) => a + 1)
    setValue('')
    setHintOpen(false)
    setResult(null)
    if (!solo) setTurn(other(turn))
  }

  const useHint = () => {
    if (hintOpen || hints[turn] <= 0 || result) return
    sfx.click()
    setHints((h) => ({ ...h, [turn]: h[turn] - 1 }))
    setHintOpen(true)
  }

  // Enter = submit, then Enter again = next
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused || e.key !== 'Enter') return
      if (result) next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!q) return null
  const box = <span className={`missing ${result === 'correct' ? 'ok' : ''}`}>{result ? fmt(q.answer) : '?'}</span>
  const nextLabel = finished ? (shields <= 0 ? 'ESCAPE THE PLANET!' : 'FINISH MISSION') : 'NEXT CHALLENGE'

  return (
    <div className="screen boss">
      <div className="nebula nebula-boss" />
      <Stars count={90} seed={3} />
      <div className="energy-streaks" />
      <div className="corner-ast tl"><Asteroid size={120} rot={30} /></div>
      <div className="corner-ast tr"><Asteroid size={90} rot={160} /></div>
      <div className="corner-ast bl"><Asteroid size={100} rot={250} /></div>
      <div className="corner-ast br"><Asteroid size={130} rot={90} /></div>
      <div className="crystal-float c1"><Crystal size={30} /></div>
      <div className="crystal-float c2"><Crystal size={24} color="#19D9F4" /></div>
      <div className="crystal-float c3"><Crystal size={28} color="#FF8A2A" /></div>

      {/* Boss health */}
      <div className="boss-health">
        <div className="boss-medal">
          <svg viewBox="0 0 40 40" width="52" height="52" aria-hidden>
            <circle cx="20" cy="20" r="17" fill="#C4A8FF" stroke="#2A1660" strokeWidth="3" />
            <circle cx="13" cy="19" r="4" fill="#fff" stroke="#2A1660" strokeWidth="2" />
            <circle cx="20" cy="15" r="5" fill="#fff" stroke="#2A1660" strokeWidth="2" />
            <circle cx="27" cy="19" r="4" fill="#fff" stroke="#2A1660" strokeWidth="2" />
          </svg>
        </div>
        <div className="boss-bar-wrap">
          <div className="boss-bar-label">
            <span>CAPTAIN NULL{solo ? ` · CHALLENGE ${asked} / ${BOSS_SHIELDS}` : ''}</span>
            <span>
              {shields} / {BOSS_SHIELDS} SHIELDS
            </span>
          </div>
          <div className="boss-bar">
            {Array.from({ length: BOSS_SHIELDS }, (_, i) => (
              <span key={i} className={i < shields ? 'on' : 'broken'} />
            ))}
          </div>
        </div>
      </div>
      <div className="hud-right">
        <SoundButton on={sound} toggle={toggleSound} />
        <IconButton label="Pause" icon="pause" onClick={onPause} />
      </div>

      <div className="boss-figure">
        <div className="shield-arcs" style={{ opacity: shields / BOSS_SHIELDS }} />
        <CaptainNull width={400} hit={hit} />
      </div>

      {solo && player ? (
        <div className="boss-team left">
          <PlayerCard name={player.name} cls={player.cls} score={scores.comets} hints={hints.comets} compact />
        </div>
      ) : (
        <>
          <div className="boss-team left">
            <TeamCard team="comets" score={scores.comets} active={turn === 'comets'} compact hints={hints.comets} />
          </div>
          <div className="boss-team right">
            <TeamCard team="rockets" score={scores.rockets} active={turn === 'rockets'} compact hints={hints.rockets} />
          </div>
        </>
      )}

      {/* Challenge */}
      <div className={`glass challenge-card ${shake ? 'shake' : ''}`} key={q.product + '-' + q.answer + '-' + asked}>
        <div className="q-label violet">FINAL CHALLENGE • MISSING FACTOR</div>
        <div className="equation boss-eq">
          {q.left === null ? box : fmt(q.left)} × {q.right === null ? box : fmt(q.right)} = {fmt(q.product)}
        </div>
        <label className="input-label" htmlFor="boss-input">
          TYPE THE MISSING NUMBER
        </label>
        <div className="boss-row">
          <input
            id="boss-input"
            ref={inputRef}
            className={`num-input ${result === 'correct' ? 'ok' : result === 'wrong' ? 'bad' : ''}`}
            inputMode="numeric"
            autoComplete="off"
            value={value}
            disabled={!!result}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9,]/g, '').slice(0, 6))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !result) {
                e.stopPropagation()
                e.preventDefault()
                submit()
              }
            }}
            placeholder="?"
          />
          {!result ? (
            <>
              <button className="btn btn-orange" onClick={submit} disabled={value.trim() === ''}>
                SUBMIT
              </button>
              <button className="btn btn-violet" onClick={useHint} disabled={hintOpen || hints[turn] <= 0}>
                <Icon name="crystal" size={24} /> COSMIC HINT
                <span className="hint-badge">{hints[turn]} LEFT</span>
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-wide" onClick={next}>
              {nextLabel} <span className="arrow">→</span>
            </button>
          )}
        </div>
        <div className="boss-foot">
          {result === 'correct' ? (
            <div className="fb-line ok">
              <Icon name="check" size={22} /> SHIELD DOWN! +{BOSS_POINTS}
              {solo ? '' : ` for ${TEAMS[turn].short}`}
            </div>
          ) : result === 'wrong' ? (
            <div className="fb-line bad">
              <Icon name="x" size={22} /> The missing number is {fmt(q.answer)}. Captain Null keeps his shield!
            </div>
          ) : hintOpen ? (
            <div className="hint-box">
              <Icon name="crystal" size={22} /> {q.hint}
            </div>
          ) : (
            <div className="kbd-hint">
              Press <kbd>Enter</kbd> to submit
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- Celebration backdrop shared by results screens ---------- */
function Celebration({ party }: { party: boolean }) {
  const confetti = useRef(
    Array.from({ length: 46 }, (_, i) => {
      const side = i % 2 === 0
      return {
        x: side ? Math.random() * 300 : 1140 + Math.random() * 300,
        delay: Math.random() * 3,
        dur: 3 + Math.random() * 3,
        color: ['#19D9F4', '#FF8A2A', '#FFD44D', '#A876FF', '#37D67A'][i % 5],
        shape: i % 4,
      }
    }),
  ).current
  return (
    <>
      <div className="nebula nebula-victory" />
      <Stars count={120} seed={11} />
      <div className="portal" />
      <div className="victory-planet">
        <Planet size={360} faces={false} />
      </div>
      <div className="victory-ship">
        <Ship width={260} />
      </div>
      {party && (
        <div className="confetti" aria-hidden>
          {confetti.map((c, i) => (
            <span key={i} className={`cf cf${c.shape}`} style={{ left: c.x, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s` }} />
          ))}
        </div>
      )}
      <svg className="layer" viewBox="0 0 1440 900" aria-hidden>
        <Sparkle x={150} y={160} s={1.6} />
        <Sparkle x={1290} y={210} s={1.2} color="#A8F5FF" />
        <Sparkle x={240} y={720} s={0.9} />
        <Sparkle x={1210} y={680} s={1.4} />
      </svg>
      <div className="victory-chest left">
        <Chest size={110} />
      </div>
      <div className="victory-chest right">
        <Chest size={90} />
      </div>
    </>
  )
}

/* ---------- Screen 04: Victory (team) ---------- */
function Victory({ scores, missionsCorrect, onAgain, onMenu, sound, toggleSound }: { scores: Scores; missionsCorrect: number; onAgain: () => void; onMenu: () => void; sound: boolean; toggleSound: () => void }) {
  const ranked = (['comets', 'rockets'] as TeamId[]).sort((a, b) => scores[b] - scores[a])
  const tie = scores.comets === scores.rockets

  return (
    <div className="screen victory">
      <Celebration party />
      <div className="hud-right">
        <SoundButton on={sound} toggle={toggleSound} />
      </div>

      <div className="victory-head">
        <div className="eyebrow yellow">GALAXY SAVED!</div>
        <h1 className="title victory-title">MISSION COMPLETE</h1>
      </div>

      <div className="glass podium">
        <Bolts />
        {tie && <div className="tie-tag">IT'S A TIE — BOTH TEAMS WIN!</div>}
        {ranked.map((t, i) => (
          <div key={t} className={`rank-row team-${t} ${i === 0 || tie ? 'winner' : ''}`}>
            <span className="rank-num">{tie ? 1 : i + 1}</span>
            <span className="rank-icon">{i === 0 || tie ? <Icon name="crown" size={30} /> : <Icon name="medal" size={30} />}</span>
            <span className="rank-name">{TEAMS[t].name}</span>
            <span className="rank-pts">{fmt(scores[t])} PTS</span>
          </div>
        ))}
        <div className="summary-row">
          <div>
            <small>TOTAL POINTS</small>
            <b>{fmt(scores.comets + scores.rockets)}</b>
          </div>
          <div>
            <small>MISSIONS CORRECT</small>
            <b>
              {missionsCorrect} / {MISSIONS}
            </b>
          </div>
          <div>
            <small>BOSS</small>
            <b>DEFEATED</b>
          </div>
        </div>
        <div className="reinforce">Multiples of 10 mastered!</div>
      </div>

      <div className="victory-ctas">
        <button className="btn btn-primary btn-lg" onClick={onAgain}>
          <Icon name="rocket" size={30} /> PLAY AGAIN
        </button>
        <button className="btn btn-outline" onClick={onMenu}>
          BACK TO MAIN MENU
        </button>
      </div>
    </div>
  )
}

/* ---------- Solo results ---------- */
type SaveState = 'saving' | 'saved' | 'failed' | 'offline'

function SoloResults({
  player,
  score,
  missionsCorrect,
  bossCorrect,
  shieldsLeft,
  save,
  onRetrySave,
  onDone,
  sound,
  toggleSound,
}: {
  player: { cls: string; name: string }
  score: number
  missionsCorrect: number
  bossCorrect: number
  shieldsLeft: number
  save: SaveState
  onRetrySave: () => void
  onDone: () => void
  sound: boolean
  toggleSound: () => void
}) {
  const won = shieldsLeft <= 0
  const total = missionsCorrect + bossCorrect
  const stars = total >= 12 ? 3 : total >= 9 ? 2 : total >= 5 ? 1 : 0
  return (
    <div className="screen victory">
      <Celebration party={won || total >= 9} />
      <div className="hud-right">
        <SoundButton on={sound} toggle={toggleSound} />
      </div>
      <div className="victory-head">
        <div className="eyebrow yellow">{won ? 'GALAXY SAVED!' : 'GREAT EFFORT, PILOT!'}</div>
        <h1 className="title victory-title">{won ? 'MISSION COMPLETE' : 'YOU ESCAPED!'}</h1>
      </div>

      <div className="glass podium solo-podium">
        <Bolts />
        <div className="solo-name" dir="auto">
          {player.name} <span>· {player.cls}</span>
        </div>
        <div className="star-row" aria-label={`${stars} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <svg key={i} viewBox="0 0 24 24" width="56" height="56" className={i < stars ? 'star on' : 'star'} aria-hidden>
              <path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21.1l1.4-7L2 9.3l7-.8z" />
            </svg>
          ))}
        </div>
        <div className="summary-row">
          <div>
            <small>SCORE</small>
            <b>{fmt(score)}</b>
          </div>
          <div>
            <small>MISSIONS</small>
            <b>
              {missionsCorrect} / {MISSIONS}
            </b>
          </div>
          <div>
            <small>BOSS SHIELDS</small>
            <b>
              {bossCorrect} / {BOSS_SHIELDS}
            </b>
          </div>
        </div>
        <div className="reinforce">{won ? 'You beat Captain Null! Multiples of 10 mastered!' : `Captain Null escaped with ${shieldsLeft} shield${shieldsLeft === 1 ? '' : 's'}. Keep practising!`}</div>
        <div className={`save-line save-${save}`}>
          {save === 'saving' && (
            <>
              <span className="spinner" /> Sending your score to your teacher…
            </>
          )}
          {save === 'saved' && (
            <>
              <Icon name="check" size={22} /> Your teacher got your score!
            </>
          )}
          {save === 'failed' && (
            <>
              <Icon name="x" size={22} /> Could not send your score.{' '}
              <button className="link-btn" onClick={onRetrySave}>
                Try again
              </button>
            </>
          )}
          {save === 'offline' && <>Practice round (scores are not being saved yet)</>}
        </div>
      </div>

      <div className="victory-ctas">
        <button className="btn btn-primary btn-lg" onClick={onDone} disabled={save === 'saving'}>
          DONE
        </button>
      </div>
    </div>
  )
}

/* ---------- App ---------- */
export default function App() {
  const scale = useStageScale()
  const [screen, setScreen] = useState<Screen>('menu')
  const [mode, setMode] = useState<Mode>('solo')
  const [player, setPlayer] = useState<{ cls: string; name: string } | null>(null)
  const [cls, setCls] = useState<string>(() => {
    const p = new URLSearchParams(window.location.search).get('class')?.toUpperCase() || ''
    return CLASSES[p] ? p : ''
  })
  const [starter, setStarter] = useState<TeamId>('comets')
  const [turn, setTurn] = useState<TeamId>('comets')
  const [scores, setScores] = useState<Scores>({ comets: 0, rockets: 0 })
  const [missionsCorrect, setMissionsCorrect] = useState(0)
  const [bossResult, setBossResult] = useState({ shieldsLeft: 0, correct: 0, hints: 0 })
  const [save, setSave] = useState<SaveState>('saving')
  const [sound, setSoundState] = useState(() => {
    try {
      return localStorage.getItem('10x-sound') !== 'off'
    } catch {
      return true
    }
  })
  const [howTo, setHowTo] = useState(false)
  // Team mode on one shared screen is opened from the teacher dashboard (/?mode=team)
  const [teamSetup, setTeamSetup] = useState(() => new URLSearchParams(window.location.search).get('mode') === 'team')
  const [paused, setPaused] = useState(false)
  const [confirmMenu, setConfirmMenu] = useState(false)
  const [runId, setRunId] = useState(0)
  const [warp, setWarp] = useState(0)
  const records = useRef<Rec[]>([])
  const startedAt = useRef(0)

  useEffect(() => setSound(sound), [sound])
  useEffect(() => {
    resendPending()
  }, [])

  const toggleSound = () => {
    setSoundState((s) => {
      const n = !s
      try {
        localStorage.setItem('10x-sound', n ? 'on' : 'off')
      } catch {
        /* ignore */
      }
      setSound(n)
      if (n) sfx.click()
      return n
    })
  }

  const go = (s: Screen) => {
    sfx.warp()
    setWarp((w) => w + 1)
    setScreen(s)
  }

  const addPoints = useCallback((t: TeamId, n: number) => setScores((s) => ({ ...s, [t]: s[t] + n })), [])
  const onRecord = useCallback((r: Rec) => {
    records.current.push(r)
  }, [])

  const resetRun = (first: TeamId) => {
    setScores({ comets: 0, rockets: 0 })
    setTurn(first)
    setMissionsCorrect(0)
    setRunId((r) => r + 1)
    setPaused(false)
    records.current = []
    startedAt.current = Date.now()
  }

  const startTeam = () => {
    setMode('team')
    setTeamSetup(false)
    resetRun(starter)
    go('mission')
  }

  const startSolo = (name: string) => {
    setMode('solo')
    setPlayer({ cls, name })
    resetRun('comets')
    go('mission')
  }

  const sendResult = async (p: { cls: string; name: string }, payload: Parameters<typeof finishAttempt>[2]) => {
    if (!connected()) {
      setSave('offline')
      return
    }
    setSave('saving')
    const ok = await finishAttempt(p.cls, p.name, payload)
    setSave(ok ? 'saved' : 'failed')
  }

  const lastPayload = useRef<Parameters<typeof finishAttempt>[2] | null>(null)

  const onBossFinish = (shieldsLeft: number, correct: number, hints: number) => {
    setBossResult({ shieldsLeft, correct, hints })
    if (mode === 'team') {
      sfx.victory()
      go('victory')
      return
    }
    if (shieldsLeft <= 0) sfx.victory()
    go('solo-results')
    if (player) {
      const payload = {
        score: scores.comets,
        missions: missionsCorrect,
        boss: correct,
        hints,
        startedAt: startedAt.current,
        details: [...records.current],
      }
      lastPayload.current = payload
      sendResult(player, payload)
    }
  }

  const restartMission = () => {
    setPaused(false)
    if (mode === 'team') startTeam()
    else {
      // Solo players can't restart (one attempt) — just resume.
    }
  }

  const toMenu = () => {
    setPaused(false)
    setConfirmMenu(false)
    setPlayer(null)
    go('menu')
  }

  // Escape pauses during play
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (howTo) setHowTo(false)
        else if (screen === 'mission' || screen === 'boss') setPaused((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen, howTo])

  const playProps: PlayProps = {
    mode,
    player,
    turn,
    setTurn,
    scores,
    addPoints,
    paused,
    onPause: () => setPaused(true),
    sound,
    toggleSound,
    onRecord,
    runId,
  }

  return (
    <div className="viewport">
      <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div key={warp} className="warp-in">
          {screen === 'menu' && (
            <>
              <MainMenu onSolo={() => go(cls ? 'name' : 'class')} onHowTo={() => setHowTo(true)} />
              <div className="hud-right">
                <SoundButton on={sound} toggle={toggleSound} />
              </div>
            </>
          )}
          {screen === 'class' && (
            <ClassPick
              onBack={() => go('menu')}
              onPick={(c) => {
                setCls(c)
                go('name')
              }}
            />
          )}
          {screen === 'name' && cls && <NamePick cls={cls} onBack={() => go('class')} onConfirm={startSolo} />}
          {screen === 'mission' && (
            <Mission
              {...playProps}
              onDone={(c) => {
                setMissionsCorrect(c)
                setTurn(mode === 'team' ? starter : 'comets')
                go('boss')
              }}
            />
          )}
          {screen === 'boss' && <Boss {...playProps} onFinish={onBossFinish} />}
          {screen === 'victory' && <Victory scores={scores} missionsCorrect={missionsCorrect} onAgain={startTeam} onMenu={() => go('menu')} sound={sound} toggleSound={toggleSound} />}
          {screen === 'solo-results' && player && (
            <SoloResults
              player={player}
              score={scores.comets}
              missionsCorrect={missionsCorrect}
              bossCorrect={bossResult.correct}
              shieldsLeft={bossResult.shieldsLeft}
              save={save}
              onRetrySave={() => lastPayload.current && sendResult(player, lastPayload.current)}
              onDone={toMenu}
              sound={sound}
              toggleSound={toggleSound}
            />
          )}
        </div>
        <div key={`w${warp}`} className="warp-lines" aria-hidden />

        {howTo && (
          <Overlay onClose={() => setHowTo(false)} wide>
            <h2 className="modal-title">HOW TO PLAY</h2>
            <div className="howto-grid">
              <div className="howto-step">
                <span className="step-num">1</span>
                <b>Ignore the zeros</b>
                <p>
                  40 × 30 → <em>4 × 3</em>
                </p>
              </div>
              <div className="howto-step">
                <span className="step-num">2</span>
                <b>Multiply</b>
                <p>
                  4 × 3 = <em>12</em>
                </p>
              </div>
              <div className="howto-step">
                <span className="step-num">3</span>
                <b>Add the zeros back</b>
                <p>
                  12 + two zeros = <em>1,200</em>
                </p>
              </div>
            </div>
            <ul className="howto-list">
              <li>
                <b>8 missions:</b> pick the right answer. Each one gives <b>+{MISSION_POINTS}</b> and fills your ship's fuel. You have {SOLO_SECONDS} seconds for each.
              </li>
              <li>
                <b>Final boss:</b> find the missing factor to break Captain Null's {BOSS_SHIELDS} shields (<b>+{BOSS_POINTS}</b> each). Drop the zeros, then divide: 40 × ? = 200 → 4 × ? = 20 → 20 ÷ 4 = 5.
              </li>
              <li>
                <b>You play one time,</b> and your score goes to your teacher. Take your time and think!
              </li>
            </ul>
            <button className="btn btn-primary" onClick={() => setHowTo(false)}>
              GOT IT!
            </button>
          </Overlay>
        )}

        {teamSetup && (
          <Overlay onClose={() => setTeamSetup(false)}>
            <h2 className="modal-title">TEAM MODE</h2>
            <p className="modal-text">Two teams take turns on your shared screen. {MISSION_SECONDS}-second timer. Choose who starts:</p>
            <div className="team-select">
              {(['comets', 'rockets'] as TeamId[]).map((t) => (
                <button
                  key={t}
                  className={`team-pick team-${t} ${starter === t ? 'selected' : ''}`}
                  onClick={() => {
                    sfx.click()
                    setStarter(t)
                  }}
                  aria-pressed={starter === t}
                >
                  <span className="team-pick-name">{TEAMS[t].name}</span>
                  <span className="team-pick-sub">{starter === t ? 'Starts first' : 'Goes second'}</span>
                  {starter === t && (
                    <span className="check-badge">
                      <Icon name="check" size={18} />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="modal-actions row">
              <button className="btn btn-outline" onClick={() => setTeamSetup(false)}>
                CANCEL
              </button>
              <button className="btn btn-primary" onClick={startTeam}>
                START
              </button>
            </div>
          </Overlay>
        )}

        {paused && !confirmMenu && (
          <Overlay>
            <h2 className="modal-title">PAUSED</h2>
            {mode === 'solo' && <p className="modal-text">The timer is stopped. Take a breath!</p>}
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setPaused(false)}>
                RESUME
              </button>
              {mode === 'team' && (
                <>
                  <button className="btn btn-outline" onClick={restartMission}>
                    RESTART MISSION
                  </button>
                  <button className="btn btn-ghost" onClick={() => setConfirmMenu(true)}>
                    MAIN MENU
                  </button>
                </>
              )}
            </div>
          </Overlay>
        )}

        {confirmMenu && (
          <Overlay>
            <h2 className="modal-title">LEAVE THE MISSION?</h2>
            <p className="modal-text">Scores will be lost and the ship returns to the main menu.</p>
            <div className="modal-actions row">
              <button className="btn btn-outline" onClick={() => setConfirmMenu(false)}>
                STAY
              </button>
              <button className="btn btn-coral" onClick={toMenu}>
                LEAVE
              </button>
            </div>
          </Overlay>
        )}
      </div>
    </div>
  )
}
