import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { BOSS_SHIELDS, MISSIONS, SKILLS, fmt } from './game'
import { CLASSES, CLASS_IDS } from './roster'
import { connected, fetchResults, resetStudent, type ResultRow } from './api'
import { Icon } from './art'

const PIN_KEY = '10x-teacher-pin'
const MAX_SCORE = MISSIONS * 200 + BOSS_SHIELDS * 300

function readPin() {
  try {
    return sessionStorage.getItem(PIN_KEY) || ''
  } catch {
    return ''
  }
}
function savePin(p: string) {
  try {
    sessionStorage.setItem(PIN_KEY, p)
  } catch {
    /* ignore */
  }
}

const timeFmt = (iso: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

type Status = 'Finished' | 'Playing' | 'Not started'

function StatusChip({ s }: { s: Status }) {
  return (
    <span className={`chip chip-${s === 'Finished' ? 'done' : s === 'Playing' ? 'play' : 'none'}`}>
      {s === 'Finished' ? <Icon name="check" size={14} /> : s === 'Playing' ? <span className="dot" /> : <span className="dash-dot" />}
      {s}
    </span>
  )
}

export default function Teacher() {
  const [pin, setPin] = useState(readPin)
  const [pinInput, setPinInput] = useState('')
  const [rows, setRows] = useState<ResultRow[] | null>(null)
  const [sheetUrl, setSheetUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [cls, setCls] = useState(CLASS_IDS[0])
  const [open, setOpen] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState<string | null>(null)
  const [updated, setUpdated] = useState<Date | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(
    async (p = pin) => {
      if (!p || !connected()) return
      setLoading(true)
      try {
        const r = await fetchResults(p)
        if (!r.ok) {
          if (r.error === 'pin') {
            setPin('')
            savePin('')
            setError('That PIN is not right. Try again.')
          } else setError('Could not load results: ' + (r.error || 'unknown error'))
        } else {
          setRows(r.rows)
          setSheetUrl(r.sheetUrl)
          setError('')
          setUpdated(new Date())
        }
      } catch {
        setError('Could not reach the Google Sheet. Check your internet and press Refresh.')
      }
      setLoading(false)
    },
    [pin],
  )

  useEffect(() => {
    load()
    const id = window.setInterval(() => load(), 30000)
    return () => window.clearInterval(id)
  }, [load])

  const submitPin = (e: FormEvent) => {
    e.preventDefault()
    const p = pinInput.trim()
    if (!p) return
    savePin(p)
    setPin(p)
    load(p)
  }

  const classRows = useMemo(() => {
    const byName = new Map((rows || []).filter((r) => r.cls === cls).map((r) => [r.name, r]))
    const roster = CLASSES[cls] || []
    const list = roster.map((name) => ({ name, row: byName.get(name) }))
    // anyone in the Sheet who isn't on the roster
    byName.forEach((row, name) => {
      if (!roster.includes(name)) list.push({ name, row })
    })
    return list
  }, [rows, cls])

  const stats = useMemo(() => {
    const finished = classRows.filter((r) => r.row?.status === 'Finished').map((r) => r.row!)
    const playing = classRows.filter((r) => r.row?.status === 'Playing').length
    const avgScore = finished.length ? Math.round(finished.reduce((a, r) => a + Number(r.score || 0), 0) / finished.length) : 0
    const totalQ = finished.length * (MISSIONS + BOSS_SHIELDS)
    const totalOk = finished.reduce((a, r) => a + Number(r.total || 0), 0)
    const acc = totalQ ? Math.round((totalOk / totalQ) * 100) : 0

    const skillOrder = [SKILLS.oneDigit, SKILLS.tensTens, SKILLS.twoDigit, SKILLS.missing]
    const skills = skillOrder.map((s) => {
      let n = 0
      let ok = 0
      finished.forEach((r) =>
        (r.details || []).forEach((d) => {
          if (d.skill === s) {
            n++
            if (d.ok) ok++
          }
        }),
      )
      return { skill: s, n, ok, pct: n ? Math.round((ok / n) * 100) : null }
    })

    const missed = new Map<string, { q: string; wrong: number; tries: number; correct: number }>()
    finished.forEach((r) =>
      (r.details || []).forEach((d) => {
        const m = missed.get(d.q) || { q: d.q, wrong: 0, tries: 0, correct: d.correct }
        m.tries++
        if (!d.ok) m.wrong++
        missed.set(d.q, m)
      }),
    )
    const mostMissed = [...missed.values()]
      .filter((m) => m.wrong > 0)
      .sort((a, b) => b.wrong - a.wrong || b.wrong / b.tries - a.wrong / a.tries)
      .slice(0, 5)

    return { finished: finished.length, playing, notStarted: classRows.length - finished.length - playing, avgScore, acc, skills, mostMissed }
  }, [classRows])

  const doReset = async (name: string) => {
    setConfirmReset(null)
    try {
      const r = await resetStudent(pin, cls, name)
      if (!r.ok) setError('Could not reset: ' + (r.error || 'unknown error'))
    } catch {
      setError('Could not reach the Google Sheet to reset.')
    }
    load()
  }

  const studentLink = `${window.location.origin}/?class=${cls}`
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(studentLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }

  /* ---------- Not connected yet ---------- */
  if (!connected()) {
    return (
      <div className="dash-page">
        <DashHeader />
        <main className="dash-main narrow">
          <section className="dcard">
            <h2>Connect your Google Sheet</h2>
            <p>The dashboard needs your Google Sheet before it can show results. Students can already play, but their scores aren't saved yet.</p>
            <ol className="steps">
              <li>Create a new Google Sheet.</li>
              <li>
                Open <b>Extensions → Apps Script</b>, paste the script from <code>apps-script/Code.gs</code>, and save.
              </li>
              <li>
                <b>Deploy → New deployment → Web app</b>. Set "Execute as: Me" and "Who has access: Anyone", then deploy.
              </li>
              <li>Send the Web app URL to Claude to connect it.</li>
            </ol>
          </section>
        </main>
      </div>
    )
  }

  /* ---------- PIN ---------- */
  if (!pin) {
    return (
      <div className="dash-page">
        <DashHeader />
        <main className="dash-main narrow">
          <form className="dcard pin-card" onSubmit={submitPin}>
            <h2>Teacher PIN</h2>
            <p>Enter your PIN to see your students' results.</p>
            <input className="pin-input" type="password" inputMode="numeric" autoFocus value={pinInput} onChange={(e) => setPinInput(e.target.value)} aria-label="Teacher PIN" />
            {error && <div className="derror">{error}</div>}
            <button className="dbtn primary" type="submit">
              Open dashboard
            </button>
          </form>
        </main>
      </div>
    )
  }

  /* ---------- Dashboard ---------- */
  return (
    <div className="dash-page">
      <DashHeader>
        <span className="updated">{loading ? 'Refreshing…' : updated ? `Updated ${updated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
        <button className="dbtn" onClick={() => load()} disabled={loading}>
          Refresh
        </button>
        {sheetUrl && (
          <a className="dbtn" href={sheetUrl} target="_blank" rel="noreferrer">
            Open Sheet
          </a>
        )}
      </DashHeader>

      <main className="dash-main">
        {error && <div className="derror">{error}</div>}

        <div className="tabs" role="tablist">
          {CLASS_IDS.map((c) => {
            const done = (rows || []).filter((r) => r.cls === c && r.status === 'Finished').length
            return (
              <button key={c} role="tab" aria-selected={cls === c} className={`tab ${cls === c ? 'on' : ''}`} onClick={() => setCls(c)}>
                Grade {c}
                <span className="tab-count">
                  {done}/{CLASSES[c].length}
                </span>
              </button>
            )
          })}
        </div>

        <div className="link-row">
          <span>Student link for {cls}:</span>
          <code>{studentLink}</code>
          <button className="dbtn small" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <div className="tiles">
          <div className="tile">
            <small>Finished</small>
            <b>
              {stats.finished}
              <span>/{classRows.length}</span>
            </b>
          </div>
          <div className="tile">
            <small>Playing now</small>
            <b>{stats.playing}</b>
          </div>
          <div className="tile">
            <small>Not started</small>
            <b>{stats.notStarted}</b>
          </div>
          <div className="tile">
            <small>Average score</small>
            <b>
              {stats.finished ? fmt(stats.avgScore) : '—'}
              <span>/{fmt(MAX_SCORE)}</span>
            </b>
          </div>
          <div className="tile">
            <small>Class accuracy</small>
            <b>{stats.finished ? `${stats.acc}%` : '—'}</b>
          </div>
        </div>

        <div className="two-col">
          <section className="dcard">
            <h3>Accuracy by skill</h3>
            {stats.finished === 0 ? (
              <p className="muted">Results will appear when students finish.</p>
            ) : (
              <div className="skill-bars">
                {stats.skills.map((s) => (
                  <div key={s.skill} className="skill-row" title={`${s.skill}: ${s.ok} of ${s.n} correct`}>
                    <span className="skill-name">{s.skill}</span>
                    <span className="skill-track">
                      <span className="skill-fill" style={{ width: `${s.pct ?? 0}%` }} />
                    </span>
                    <span className="skill-val">{s.pct === null ? '—' : `${s.pct}%`}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="dcard">
            <h3>Most-missed questions</h3>
            {stats.mostMissed.length === 0 ? (
              <p className="muted">{stats.finished ? 'No missed questions yet. ' : ''}Results will appear when students finish.</p>
            ) : (
              <ol className="missed">
                {stats.mostMissed.map((m) => (
                  <li key={m.q}>
                    <span className="mq">{m.q.includes('?') ? m.q.replace('?', `? (${fmt(m.correct)})`) : `${m.q} = ${fmt(m.correct)}`}</span>
                    <span className="mw">
                      {m.wrong} of {m.tries} wrong
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <section className="dcard table-card">
          <h3>Students</h3>
          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Status</th>
                  <th className="num">Score</th>
                  <th className="num">Missions</th>
                  <th className="num">Boss</th>
                  <th className="num">Hints</th>
                  <th className="num">Time</th>
                  <th>Finished</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {classRows.map(({ name, row }) => {
                  const status: Status = row?.status === 'Finished' ? 'Finished' : row ? 'Playing' : 'Not started'
                  const isOpen = open === name
                  return (
                    <Fragment key={name}>
                      <tr className={isOpen ? 'open' : ''}>
                        <td className="sname" dir="auto">
                          {name}
                        </td>
                        <td>
                          <StatusChip s={status} />
                        </td>
                        <td className="num strong">{status === 'Finished' ? fmt(Number(row!.score)) : '—'}</td>
                        <td className="num">{status === 'Finished' ? `${row!.missions}/${MISSIONS}` : '—'}</td>
                        <td className="num">{status === 'Finished' ? `${row!.boss}/${BOSS_SHIELDS}` : '—'}</td>
                        <td className="num">{status === 'Finished' ? row!.hints : '—'}</td>
                        <td className="num">{status === 'Finished' && row!.minutes !== '' ? `${row!.minutes} min` : '—'}</td>
                        <td>{status === 'Finished' ? timeFmt(row!.finished) : status === 'Playing' ? `Started ${timeFmt(row!.started)}` : '—'}</td>
                        <td>
                          <div className="actions">
                          {status === 'Finished' && (
                            <button className="dbtn small" onClick={() => setOpen(isOpen ? null : name)}>
                              {isOpen ? 'Hide' : 'Answers'}
                            </button>
                          )}
                          {status !== 'Not started' && (
                            <button className="dbtn small ghost" onClick={() => setConfirmReset(name)}>
                              Allow retry
                            </button>
                          )}
                          </div>
                        </td>
                      </tr>
                      {isOpen && row && (
                        <tr className="detail-row">
                          <td colSpan={9}>
                            <div className="answers-list">
                              {(row.details || []).map((d, i) => (
                                <div key={i} className={`ans ${d.ok ? 'ok' : 'bad'}`}>
                                  <span className="ans-icon">{d.ok ? <Icon name="check" size={14} /> : <Icon name="x" size={14} />}</span>
                                  <span className="ans-q">{d.kind === 'boss' ? d.q : `${d.q} = ${fmt(d.correct)}`}</span>
                                  <span className="ans-a">
                                    {d.answer === null ? 'no answer (time ran out)' : d.ok ? `answered ${fmt(d.answer)}` : `answered ${fmt(d.answer)} · correct ${fmt(d.correct)}`}
                                    {d.hint ? ' · used hint' : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {confirmReset && (
        <div className="dmodal-bg" onClick={() => setConfirmReset(null)}>
          <div className="dcard dmodal" onClick={(e) => e.stopPropagation()}>
            <h3>Allow another try?</h3>
            <p>
              This deletes <b dir="auto">{confirmReset}</b>'s current result so they can play again.
            </p>
            <div className="dmodal-actions">
              <button className="dbtn" onClick={() => setConfirmReset(null)}>
                Cancel
              </button>
              <button className="dbtn danger" onClick={() => doReset(confirmReset)}>
                Delete and allow retry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DashHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="dash-header">
      <div className="dash-brand">
        <svg viewBox="0 0 64 64" width="34" height="34" aria-hidden>
          <circle cx="32" cy="32" r="20" fill="#743EF5" stroke="#2a1660" strokeWidth="3" />
          <ellipse cx="32" cy="32" rx="30" ry="9" fill="none" stroke="#19D9F4" strokeWidth="4" transform="rotate(-20 32 32)" />
        </svg>
        <div>
          <b>Escape the 10X Planet</b>
          <small>Teacher dashboard · Topic 4 Lesson 4.1</small>
        </div>
      </div>
      <div className="dash-actions">{children}</div>
    </header>
  )
}
