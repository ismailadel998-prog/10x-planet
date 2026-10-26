// Vector illustrations — kept separate from game logic
import { useMemo } from 'react'

const KEY = '#2A1660' // dark-violet keyline

/** Deterministic star field so it doesn't jump between renders */
export function Stars({ count = 140, seed = 7 }: { count?: number; seed?: number }) {
  const stars = useMemo(() => {
    let s = seed
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
    return Array.from({ length: count }, () => ({
      x: r() * 1440,
      y: r() * 900,
      size: r() < 0.08 ? 3 : r() < 0.35 ? 2 : 1.2,
      o: 0.35 + r() * 0.65,
      d: r() * 4,
    }))
  }, [count, seed])
  return (
    <svg className="layer" viewBox="0 0 1440 900" aria-hidden>
      {stars.map((st, i) => (
        <circle
          key={i}
          cx={st.x}
          cy={st.y}
          r={st.size}
          fill={i % 9 === 0 ? '#A8F5FF' : i % 13 === 0 ? '#FFD44D' : '#F8FBFF'}
          opacity={st.o}
          className={st.size > 2 ? 'twinkle' : undefined}
          style={{ animationDelay: `${st.d}s` }}
        />
      ))}
    </svg>
  )
}

export function Sparkle({ x, y, s = 1, color = '#FFD44D' }: { x: number; y: number; s?: number; color?: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -12 C2 -3 3 -2 12 0 C3 2 2 3 0 12 C-2 3 -3 2 -12 0 C-3 -2 -2 -3 0 -12Z"
      fill={color}
    />
  )
}

export function Planet({ size = 600, faces = true }: { size?: number; faces?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 600 600" aria-hidden>
      <defs>
        <radialGradient id="pl-body" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#8F6BFF" />
          <stop offset="45%" stopColor="#5A35D6" />
          <stop offset="80%" stopColor="#2C1D8A" />
          <stop offset="100%" stopColor="#1A1144" />
        </radialGradient>
        <radialGradient id="pl-atmo" cx="50%" cy="50%" r="50%">
          <stop offset="78%" stopColor="#FF8A2A" stopOpacity="0" />
          <stop offset="90%" stopColor="#FF8A2A" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#FF8A2A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="pl-ring" x1="0" x2="1">
          <stop offset="0%" stopColor="#19D9F4" stopOpacity="0.15" />
          <stop offset="50%" stopColor="#A8F5FF" />
          <stop offset="100%" stopColor="#19D9F4" stopOpacity="0.15" />
        </linearGradient>
        <clipPath id="pl-clip">
          <circle cx="300" cy="300" r="190" />
        </clipPath>
        <path id="ring-path" d="M40 330 A262 72 -12 0 0 560 220" />
      </defs>
      <circle cx="300" cy="300" r="250" fill="url(#pl-atmo)" />
      {/* back half of ring */}
      <ellipse cx="300" cy="300" rx="270" ry="74" transform="rotate(-12 300 300)" fill="none" stroke="url(#pl-ring)" strokeWidth="14" opacity="0.5" />
      <circle cx="300" cy="300" r="190" fill="url(#pl-body)" stroke={KEY} strokeWidth="6" />
      <g clipPath="url(#pl-clip)">
        <path d="M100 250 C200 220 380 280 510 230 L510 270 C380 320 200 260 100 290Z" fill="#743EF5" opacity="0.45" />
        <path d="M100 380 C220 350 360 410 510 360 L510 390 C360 440 220 380 100 410Z" fill="#A876FF" opacity="0.3" />
        <circle cx="300" cy="300" r="190" fill="none" stroke="#FF8A2A" strokeWidth="10" opacity="0.6" transform="translate(10 8)" />
        {/* craters with tiny faces */}
        {[
          [220, 210, 34],
          [370, 360, 44],
          [245, 395, 22],
          [400, 220, 18],
        ].map(([cx, cy, r], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r={r} fill="#3B23A8" stroke={KEY} strokeWidth="3" />
            <circle cx={cx - r * 0.12} cy={cy - r * 0.15} r={r * 0.78} fill="#4A2FC4" />
            {faces && r > 25 && (
              <g>
                <circle cx={cx - r * 0.3} cy={cy - r * 0.1} r={r * 0.09} fill={KEY} />
                <circle cx={cx + r * 0.25} cy={cy - r * 0.1} r={r * 0.09} fill={KEY} />
                <path d={`M${cx - r * 0.25} ${cy + r * 0.2} Q${cx} ${cy + r * 0.45} ${cx + r * 0.22} ${cy + r * 0.2}`} stroke={KEY} strokeWidth="3" fill="none" strokeLinecap="round" />
              </g>
            )}
          </g>
        ))}
        <ellipse cx="230" cy="170" rx="80" ry="30" fill="#fff" opacity="0.12" transform="rotate(-25 230 170)" />
      </g>
      {/* front half of ring */}
      <path d="M33 336 A270 74 -12 0 0 567 222" fill="none" stroke="url(#pl-ring)" strokeWidth="16" strokeLinecap="round" />
      <path d="M33 336 A270 74 -12 0 0 567 222" fill="none" stroke="#19D9F4" strokeWidth="3" opacity="0.9" filter="drop-shadow(0 0 6px #19D9F4)" />
      <text fontFamily="'Baloo 2', sans-serif" fontWeight="800" fontSize="34" fill="#F8FBFF" letterSpacing="6">
        <textPath href="#ring-path" startOffset="18%">×10 · ×10 · ×10</textPath>
      </text>
    </svg>
  )
}

export function Ship({ width = 360, flame = true }: { width?: number; flame?: boolean }) {
  return (
    <svg width={width} height={width * 0.62} viewBox="0 0 360 224" aria-hidden className="ship-svg">
      <defs>
        <linearGradient id="sh-hull" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="60%" stopColor="#D6F6FF" />
          <stop offset="100%" stopColor="#7FD6EE" />
        </linearGradient>
        <linearGradient id="sh-flame" x1="1" x2="0">
          <stop offset="0%" stopColor="#FFD44D" />
          <stop offset="45%" stopColor="#FF8A2A" />
          <stop offset="100%" stopColor="#FF596D" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="sh-glass" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#A8F5FF" />
          <stop offset="100%" stopColor="#1E6BFF" />
        </radialGradient>
      </defs>
      {flame && (
        <g className="flame">
          <path d="M70 92 L0 80 L70 104Z" fill="url(#sh-flame)" />
          <path d="M70 112 L-10 112 L70 126Z" fill="url(#sh-flame)" />
          <path d="M70 134 L0 146 L70 142Z" fill="url(#sh-flame)" />
        </g>
      )}
      {/* fins */}
      <path d="M120 70 L80 20 L150 66Z" fill="#FF8A2A" stroke={KEY} strokeWidth="5" strokeLinejoin="round" />
      <path d="M120 156 L80 206 L150 160Z" fill="#FF8A2A" stroke={KEY} strokeWidth="5" strokeLinejoin="round" />
      {/* engines */}
      <rect x="62" y="86" width="26" height="62" rx="10" fill="#4A2FC4" stroke={KEY} strokeWidth="5" />
      {/* hull */}
      <path d="M80 80 C140 52 260 54 330 104 C340 112 340 118 330 124 C260 172 140 174 80 146Z" fill="url(#sh-hull)" stroke={KEY} strokeWidth="6" strokeLinejoin="round" />
      <path d="M100 136 C170 150 260 146 318 120" stroke="#19D9F4" strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="150" cy="104" r="8" fill="#FF8A2A" stroke={KEY} strokeWidth="3" />
      {/* cockpit + aliens */}
      <path d="M190 100 C200 64 270 64 292 104Z" fill="url(#sh-glass)" stroke={KEY} strokeWidth="5" />
      <g>
        <circle cx="222" cy="92" r="11" fill="#37D67A" stroke={KEY} strokeWidth="3" />
        <circle cx="219" cy="90" r="3" fill={KEY} />
        <circle cx="226" cy="90" r="3" fill={KEY} />
        <line x1="222" y1="81" x2="218" y2="72" stroke={KEY} strokeWidth="2.5" />
        <circle cx="218" cy="71" r="3" fill="#FFD44D" />
        <circle cx="258" cy="92" r="11" fill="#A876FF" stroke={KEY} strokeWidth="3" />
        <circle cx="258" cy="89" r="4" fill="#fff" />
        <circle cx="259" cy="89" r="2" fill={KEY} />
        <path d="M252 96 Q258 100 264 96" stroke={KEY} strokeWidth="2" fill="none" />
      </g>
      <path d="M205 82 C215 74 235 72 245 76" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}

export function MiniShip({ width = 120 }: { width?: number }) {
  return <Ship width={width} />
}

export function Asteroid({ size = 60, rot = 0 }: { size?: number; rot?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M20 30 L45 10 L78 18 L92 48 L80 80 L46 92 L16 76 L8 50Z" fill="#3A2E6B" stroke={KEY} strokeWidth="5" strokeLinejoin="round" />
      <path d="M26 34 L46 18 L72 24" stroke="#5C4A9E" strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="58" cy="54" r="10" fill="#2A2152" />
      <circle cx="34" cy="64" r="6" fill="#2A2152" />
    </svg>
  )
}

export function Crystal({ size = 40, color = '#A876FF' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 40 56" aria-hidden>
      <path d="M20 2 L36 20 L20 54 L4 20Z" fill={color} stroke={KEY} strokeWidth="3" strokeLinejoin="round" />
      <path d="M20 2 L20 54 M4 20 L36 20" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" />
    </svg>
  )
}

export function Chest({ size = 90 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 100 80" aria-hidden>
      <rect x="10" y="34" width="80" height="40" rx="6" fill="#FF8A2A" stroke={KEY} strokeWidth="5" />
      <path d="M10 36 C10 6 90 6 90 36Z" fill="#FFB054" stroke={KEY} strokeWidth="5" />
      <rect x="44" y="30" width="12" height="18" rx="3" fill="#FFD44D" stroke={KEY} strokeWidth="3" />
      <path d="M22 20 L30 4 M50 14 L50 -2 M78 20 L70 4" stroke="#FFD44D" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

/** Captain Null — friendly, theatrical boss */
export function CaptainNull({ width = 420, hit = false }: { width?: number; hit?: boolean }) {
  return (
    <svg width={width} height={width * 0.7} viewBox="0 0 440 308" aria-hidden className={hit ? 'boss-hit' : 'boss-idle'}>
      <defs>
        <radialGradient id="cn-body" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#EFE6FF" />
          <stop offset="60%" stopColor="#C4A8FF" />
          <stop offset="100%" stopColor="#8C66E8" />
        </radialGradient>
        <radialGradient id="cn-helmet" cx="35%" cy="30%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#A8F5FF" stopOpacity="0.08" />
        </radialGradient>
      </defs>
      {/* gauntlets */}
      <g>
        <path d="M110 200 C80 190 60 200 50 220" stroke={KEY} strokeWidth="22" strokeLinecap="round" fill="none" />
        <path d="M110 200 C80 190 60 200 50 220" stroke="#8C66E8" strokeWidth="14" strokeLinecap="round" fill="none" />
        <rect x="14" y="206" width="72" height="66" rx="22" fill="#743EF5" stroke={KEY} strokeWidth="6" />
        <rect x="24" y="214" width="52" height="14" rx="7" fill="#19D9F4" opacity="0.8" />
        <path d="M330 200 C360 190 380 200 390 220" stroke={KEY} strokeWidth="22" strokeLinecap="round" fill="none" />
        <path d="M330 200 C360 190 380 200 390 220" stroke="#8C66E8" strokeWidth="14" strokeLinecap="round" fill="none" />
        <rect x="354" y="206" width="72" height="66" rx="22" fill="#743EF5" stroke={KEY} strokeWidth="6" />
        <rect x="364" y="214" width="52" height="14" rx="7" fill="#19D9F4" opacity="0.8" />
      </g>
      {/* body */}
      <ellipse cx="220" cy="190" rx="122" ry="104" fill="url(#cn-body)" stroke={KEY} strokeWidth="7" />
      <ellipse cx="220" cy="250" rx="70" ry="22" fill="#A876FF" opacity="0.5" />
      {/* belt with null symbol */}
      <circle cx="220" cy="262" r="18" fill="#FF8A2A" stroke={KEY} strokeWidth="4" />
      <circle cx="220" cy="262" r="8" fill="none" stroke={KEY} strokeWidth="3" />
      <line x1="210" y1="272" x2="230" y2="252" stroke={KEY} strokeWidth="3" />
      {/* eyes */}
      {[
        [170, 168, 22],
        [220, 150, 28],
        [270, 168, 22],
      ].map(([cx, cy, r], i) => (
        <g key={i} className="blink" style={{ animationDelay: `${i * 0.2}s` }}>
          <circle cx={cx} cy={cy} r={r} fill="#fff" stroke={KEY} strokeWidth="5" />
          <circle cx={cx + 3} cy={cy + 3} r={r * 0.5} fill={KEY} />
          <circle cx={cx + 7} cy={cy - 2} r={r * 0.17} fill="#fff" />
        </g>
      ))}
      {/* brows: theatrical */}
      <path d="M150 138 L188 148" stroke={KEY} strokeWidth="7" strokeLinecap="round" />
      <path d="M290 138 L252 148" stroke={KEY} strokeWidth="7" strokeLinecap="round" />
      {/* grin */}
      <path d="M180 212 Q220 242 260 212" fill="#fff" stroke={KEY} strokeWidth="6" strokeLinejoin="round" />
      <path d="M200 216 L200 226 M220 220 L220 232 M240 216 L240 226" stroke={KEY} strokeWidth="3" />
      {/* bubble helmet */}
      <ellipse cx="220" cy="164" rx="150" ry="140" fill="url(#cn-helmet)" stroke="#A8F5FF" strokeOpacity="0.6" strokeWidth="4" />
      <path d="M130 90 C150 60 190 44 230 42" stroke="#fff" strokeOpacity="0.6" strokeWidth="8" strokeLinecap="round" fill="none" />
      {/* antenna crown */}
      <g>
        {[176, 220, 264].map((x, i) => (
          <g key={i}>
            <line x1={x} y1={96} x2={x + (i - 1) * 10} y2={i === 1 ? 60 : 70} stroke={KEY} strokeWidth="5" />
            <circle cx={x + (i - 1) * 10} cy={i === 1 ? 56 : 66} r={i === 1 ? 11 : 8} fill="#FFD44D" stroke={KEY} strokeWidth="4" />
          </g>
        ))}
      </g>
    </svg>
  )
}

export function Icon({ name, size = 26 }: { name: 'sound' | 'mute' | 'pause' | 'back' | 'rocket' | 'crystal' | 'check' | 'x' | 'crown' | 'medal' | 'help'; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (name) {
    case 'sound':
      return (
        <svg {...p}>
          <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
          <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
        </svg>
      )
    case 'mute':
      return (
        <svg {...p}>
          <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
          <path d="M17 9l5 6M22 9l-5 6" />
        </svg>
      )
    case 'pause':
      return (
        <svg {...p}>
          <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
          <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
        </svg>
      )
    case 'back':
      return (
        <svg {...p}>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      )
    case 'rocket':
      return (
        <svg {...p}>
          <path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2" />
          <path d="M9 15l-3-3c2-6 7-9 14-9 0 7-3 12-9 14z" fill="currentColor" fillOpacity="0.25" />
          <circle cx="15" cy="9" r="2" />
        </svg>
      )
    case 'crystal':
      return (
        <svg {...p}>
          <path d="M12 2l7 7-7 13-7-13z" fill="currentColor" fillOpacity="0.3" />
          <path d="M5 9h14M12 2v20" />
        </svg>
      )
    case 'check':
      return (
        <svg {...p} strokeWidth={3.4}>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )
    case 'x':
      return (
        <svg {...p} strokeWidth={3.4}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      )
    case 'crown':
      return (
        <svg {...p}>
          <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" fill="currentColor" />
        </svg>
      )
    case 'medal':
      return (
        <svg {...p}>
          <path d="M8 2l4 7 4-7" />
          <circle cx="12" cy="15" r="6" fill="currentColor" fillOpacity="0.3" />
        </svg>
      )
    case 'help':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 1-1 1.7M12 17h.01" />
        </svg>
      )
  }
}
