import { useRef, useState } from 'react'
import { TIERS, getTier } from '../lib/tiers'

export interface RatingPoint {
  contestId: string; contestTitle: string; date: string
  oldRating: number; newRating: number; rank: number; totalParticipants: number
}

const CW = 860, CH = 270
const PL = 55, PR = 115, PT = 22, PB = 38

interface TipPos { x: number; y: number; isRight: boolean }

export function RatingChart({ history }: { history: RatingPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [tipPos, setTipPos]   = useState<TipPos | null>(null)

  const pw = CW - PL - PR, ph = CH - PT - PB

  if (history.length === 0) {
    return <div className="chart-empty">No rated contests yet — participate to build your rating graph</div>
  }

  const ratings = history.map(p => p.newRating)
  const rawMin = Math.min(...ratings), rawMax = Math.max(...ratings)
  const yPad   = Math.max(120, (rawMax - rawMin) * 0.35)
  const yMin   = Math.max(0, Math.floor((rawMin - yPad) / 100) * 100)
  const yMax   = Math.ceil((rawMax + yPad) / 100) * 100

  const now    = new Date()
  const xStart = new Date(history[0].date)
  xStart.setDate(1)
  xStart.setMonth(xStart.getMonth() - 1)
  const xMin   = xStart.getTime()
  const xMax   = now.getTime()
  const xRange = Math.max(xMax - xMin, 1)

  const tx = (ts: number) => PL + Math.max(0, Math.min(1, (ts - xMin) / xRange)) * pw
  const ty = (r: number)  => PT + (1 - (r - yMin) / (yMax - yMin)) * ph

  const bands = TIERS.flatMap(t => {
    const lo = Math.max(t.min, yMin)
    const hi = Math.min(t.max === 9999 ? yMax : t.max, yMax)
    if (lo >= hi) return []
    return [{ ...t, y1: ty(hi), y2: ty(lo) }]
  })

  const TIER_BOUNDS = [1200, 1400, 1600, 1900, 2100, 2300]
  const yLabels = TIER_BOUNDS.filter(r => r > yMin && r < yMax)
  if (!yLabels.includes(yMin + 100) && yMin + 100 < yMax) yLabels.push(yMin + 100)
  if (!yLabels.includes(yMax - 100) && yMax - 100 > yMin) yLabels.push(yMax - 100)
  yLabels.sort((a, b) => a - b)

  const rangeMonths = Math.round(xRange / (30.44 * 86_400_000))
  const mStep = rangeMonths <= 6 ? 1 : rangeMonths <= 18 ? 2 : rangeMonths <= 36 ? 3 : 6
  const xLabels: { x: number; label: string }[] = []
  {
    let d = new Date(xStart.getFullYear(), xStart.getMonth() + 1, 1)
    while (d <= now) {
      if (d.getMonth() % mStep === 0) {
        xLabels.push({
          x: tx(d.getTime()),
          label: d.toLocaleString('en', { month: 'short', ...(rangeMonths > 14 ? { year: '2-digit' } : {}) }),
        })
      }
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    }
  }

  const pts  = history.map(p => ({ x: tx(new Date(p.date).getTime()), y: ty(p.newRating) }))
  const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaD = pts.length > 1
    ? `${lineD} L ${pts[pts.length - 1].x.toFixed(1)} ${(PT + ph).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(PT + ph).toFixed(1)} Z`
    : ''

  function onSvgMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || pts.length === 0) return
    const scale = CW / rect.width
    const svgX  = (e.clientX - rect.left) * scale

    if (svgX < PL - 10 || svgX > PL + pw + 10) {
      setHovered(null); setTipPos(null); return
    }

    let best = 0, bestDist = Infinity
    pts.forEach((p, i) => {
      const d = Math.abs(p.x - svgX)
      if (d < bestDist) { bestDist = d; best = i }
    })

    setHovered(best)
    const px = pts[best].x * (rect.width / CW)
    const py = pts[best].y * (rect.height / CH)
    setTipPos({ x: px, y: py, isRight: pts[best].x > PL + pw * 0.55 })
  }

  const hp    = hovered !== null ? history[hovered] : null
  const delta = hp ? hp.newRating - hp.oldRating : 0

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CW} ${CH}`}
        style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}
        onMouseMove={onSvgMove}
        onMouseLeave={() => { setHovered(null); setTipPos(null) }}
      >
        <defs>
          <clipPath id="rclip">
            <rect x={PL} y={PT} width={pw} height={ph} />
          </clipPath>
          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#f59e0b" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Tier bands */}
        <g clipPath="url(#rclip)">
          {bands.map(b => (
            <rect key={b.label} x={PL} y={b.y1} width={pw} height={Math.max(0, b.y2 - b.y1)} fill={b.bg} opacity={0.45} />
          ))}
        </g>

        {/* Chart border */}
        <rect x={PL} y={PT} width={pw} height={ph} fill="none" stroke="#cbd5e1" strokeWidth={1} />

        {/* Y-axis grid + labels */}
        {yLabels.map(r => {
          const y = ty(r)
          return (
            <g key={r}>
              <line x1={PL} x2={PL + pw} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={0.8} />
              <text x={PL - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#94a3b8" style={{ fontVariantNumeric: 'tabular-nums' }}>{r}</text>
            </g>
          )
        })}

        {/* X-axis ticks + labels */}
        {xLabels.map(({ x, label }) => (
          <g key={label + x.toFixed(0)}>
            <line x1={x} x2={x} y1={PT + ph} y2={PT + ph + 4} stroke="#cbd5e1" strokeWidth={1} />
            <text x={x} y={CH - 7} textAnchor="middle" fontSize={9} fill="#94a3b8">{label}</text>
          </g>
        ))}

        {/* Today line */}
        <line x1={tx(now.getTime())} x2={tx(now.getTime())} y1={PT} y2={PT + ph}
          stroke="#94a3b8" strokeWidth={1} strokeDasharray="4,3" opacity={0.55} />
        <text x={tx(now.getTime())} y={PT - 7} textAnchor="middle" fontSize={9} fill="#94a3b8">Today</text>

        {/* Area + line */}
        <g clipPath="url(#rclip)">
          {areaD && <path d={areaD} fill="url(#area-grad)" />}
          <path d={lineD} fill="none" stroke="#f59e0b" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        </g>

        {/* Vertical crosshair on hover */}
        {hovered !== null && (
          <line
            clipPath="url(#rclip)"
            x1={pts[hovered].x} x2={pts[hovered].x}
            y1={PT} y2={PT + ph}
            stroke="#94a3b8" strokeWidth={1} strokeDasharray="3,2" opacity={0.7}
          />
        )}

        {/* Data point circles */}
        <g clipPath="url(#rclip)">
          {pts.map((pt, i) => {
            const isLast = i === history.length - 1
            const isHov  = hovered === i
            const tier   = getTier(history[i].newRating)
            return (
              <circle key={i} cx={pt.x} cy={pt.y}
                r={isHov ? 7 : isLast ? 5.5 : 4}
                fill={isHov || isLast ? tier.fg : '#fff'}
                stroke={tier.fg} strokeWidth={isHov ? 0 : 2}
                style={{ transition: 'r .1s' }}
                pointerEvents="none"
              />
            )
          })}
        </g>

        {/* Tier labels on right */}
        {bands.map(b => {
          const mid = (b.y1 + b.y2) / 2
          if (b.y2 - b.y1 < 14) return null
          return (
            <text key={`lbl-${b.label}`} x={PL + pw + 8} y={mid + 4} fontSize={10} fill={b.fg} fontWeight={600}>{b.label}</text>
          )
        })}
      </svg>

      {/* Tooltip — flips left when near right edge */}
      {hp && tipPos && (
        <div className="chart-tooltip" style={{
          left: tipPos.x,
          transform: tipPos.isRight ? 'translate(calc(-100% - 14px), 0)' : 'translate(14px, 0)',
          top: Math.max(8, tipPos.y - 68),
        }}>
          <div className="chart-tooltip-title">{hp.contestTitle}</div>
          <div className="chart-tooltip-date">
            {new Date(hp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="chart-tooltip-rating" style={{ color: getTier(hp.newRating).fg }}>{hp.newRating}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: delta >= 0 ? '#16a34a' : '#dc2626' }}>
              {delta >= 0 ? '+' : ''}{delta}
            </span>
          </div>
          <div className="chart-tooltip-rank">Rank #{hp.rank} / {hp.totalParticipants}</div>
        </div>
      )}
    </div>
  )
}
