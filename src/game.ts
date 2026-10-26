// Question logic for Escape the 10X Planet (Grade 4: multiplying by multiples of 10)

export type TeamId = 'comets' | 'rockets'

export const TEAMS: Record<TeamId, { name: string; short: string }> = {
  comets: { name: 'TEAM COMETS', short: 'Comets' },
  rockets: { name: 'TEAM ROCKETS', short: 'Rockets' },
}

export const other = (t: TeamId): TeamId => (t === 'comets' ? 'rockets' : 'comets')

export const MISSIONS = 8

export const SKILLS = {
  oneDigit: '1-digit × tens',
  tensTens: 'Tens × tens',
  twoDigit: '2-digit × tens',
  missing: 'Missing factor',
}
export const MISSION_SECONDS = 20
export const BOSS_SHIELDS = 5
export const MISSION_POINTS = 200
export const BOSS_POINTS = 300

export interface MissionQ {
  a: number
  b: number
  answer: number
  choices: number[]
  cue: string
  skill: string
}

export interface BossQ {
  // left × right = product, one side hidden
  left: number | null
  right: number | null
  product: number
  answer: number
  hint: string
}

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const fmt = (n: number) => n.toLocaleString('en-US')

const zerosWord = (n: number) => (n === 1 ? 'one zero' : n === 2 ? 'two zeros' : `${n} zeros`)

function stripZeros(n: number): { core: number; zeros: number } {
  let core = n
  let zeros = 0
  while (core % 10 === 0 && core !== 0) {
    core /= 10
    zeros++
  }
  return { core, zeros }
}

function buildMission(a: number, b: number, skill = ''): MissionQ {
  const answer = a * b
  const A = stripZeros(a)
  const B = stripZeros(b)
  const zeros = A.zeros + B.zeros
  const cue = `Ignore the zeros: ${A.core} × ${B.core}. Then add ${zerosWord(zeros)}.`

  // Common mistakes as distractors
  const factProduct = A.core * B.core
  const pool = new Set<number>([
    answer / 10, // forgot a zero
    answer * 10, // added an extra zero
    (factProduct + A.core) * 10 ** zeros, // multiplication slip
    (factProduct - B.core) * 10 ** zeros,
    a + b, // added instead of multiplied
  ])
  pool.delete(answer)
  const distractors = shuffle([...pool].filter((n) => Number.isInteger(n) && n > 0 && n !== answer)).slice(0, 3)
  while (distractors.length < 3) {
    const n = answer + rand(1, 9) * 10
    if (!distractors.includes(n) && n !== answer) distractors.push(n)
  }
  return { a, b, answer, cue, skill, choices: shuffle([answer, ...distractors]) }
}

/** Worked steps shown after an answer, using the lesson's 3 steps */
export function workedSteps(q: MissionQ): string {
  const A = stripZeros(q.a)
  const B = stripZeros(q.b)
  const zeros = A.zeros + B.zeros
  return `${A.core} × ${B.core} = ${fmt(A.core * B.core)} → add ${zerosWord(zeros)} → ${fmt(q.answer)}`
}

/** 8 missions that step up: 1-digit × tens, tens × tens, 2-digit × tens */
export function makeMissions(): MissionQ[] {
  const tens = [20, 30, 40, 50, 60, 70, 80, 90]
  const used = new Set<string>(['30x40'])
  const out: MissionQ[] = []
  const add = (skill: string, gen: () => [number, number]) => {
    for (let tries = 0; tries < 50; tries++) {
      const [a, b] = gen()
      const key = [a, b].sort().join('x')
      if (!used.has(key)) {
        used.add(key)
        out.push(buildMission(a, b, skill))
        return
      }
    }
  }
  // Missions 1-2: one digit × a multiple of 10
  for (let i = 0; i < 2; i++) add(SKILLS.oneDigit, () => (Math.random() < 0.5 ? [rand(3, 9), pick(tens)] : [pick(tens), rand(3, 9)]))
  // Mission 3: the lesson example, 40 × 30
  out.push(buildMission(40, 30, SKILLS.tensTens))
  // Missions 4-5: multiple of 10 × multiple of 10
  for (let i = 0; i < 2; i++) add(SKILLS.tensTens, () => [pick(tens), pick(tens)])
  // Missions 6-8: two-digit × multiple of 10 (e.g. 23 × 30)
  for (let i = 0; i < 3; i++)
    add(SKILLS.twoDigit, () => {
      let a = rand(12, 49)
      if (a % 10 === 0) a += 1
      return [a, pick([20, 30, 40])]
    })
  return out
}

function buildBoss(known: number, unknown: number, unknownFirst: boolean): BossQ {
  const product = known * unknown
  const { core, zeros } = stripZeros(known)
  const smallProduct = product / 10 ** zeros
  const eq = unknownFirst ? `? × ${core}` : `${core} × ?`
  const hint =
    core === 1
      ? `Multiplying by ${fmt(known)} just adds ${zerosWord(zeros)}. Which number, with ${zerosWord(zeros)} added, makes ${fmt(product)}?`
      : `Drop ${zerosWord(zeros)} from ${fmt(known)} and from ${fmt(product)}: ${eq} = ${fmt(smallProduct)}. Now divide: ${fmt(smallProduct)} ÷ ${core} = ?`
  return {
    left: unknownFirst ? null : known,
    right: unknownFirst ? known : null,
    product,
    answer: unknown,
    hint,
  }
}

/** The five missing-factor examples from the lesson, in random order */
export function lessonBossQs(): BossQ[] {
  return shuffle([
    buildBoss(40, 5, false), // 40 × ? = 200
    buildBoss(90, 90, true), // ? × 90 = 8,100
    buildBoss(10, 20, false), // 10 × ? = 200
    buildBoss(30, 90, false), // 30 × ? = 2,700
    buildBoss(40, 80, false), // 40 × ? = 3,200
  ])
}

/** Extra missing-factor questions if the boss still has shields */
export function makeBossQ(): BossQ {
  const known = pick([10, 20, 30, 40, 50, 60, 70, 80, 90])
  const unknown = Math.random() < 0.5 ? rand(2, 9) : pick([20, 30, 40, 50, 60, 70, 80, 90])
  return buildBoss(known, unknown, Math.random() < 0.35)
}
