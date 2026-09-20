import { useEffect, useRef, useState } from 'react'
import { TIERS, getTier } from '../lib/tiers'

export interface RatingPoint {
  contestId: string; contestTitle: string; date: string
  oldRating: number; newRating: number; rank: number; totalParticipants: number
}

interface TipPos { x: number; y: number; isRight: boolean }

/**
 * The SVG scales to its container, so one viewBox for every screen means a
 * phone gets the desktop drawing shrunk to a third — a 292x98 letterbox with
 * 3px axis labels. A narrow screen gets its own geometry instead: taller for
 * its width, tighter margins, and no room spent on the tier legend, which the
 * bands and the tooltip already convey.
 */
function useNarrow(query = '(max-width: 640px)') {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return narrow
}

/**
 * Rating over time, drawn the way Codeforces draws it: the tier bands are the
 * background rather than a tint over it, a thin dark polyline carries the eye,
 * and each contest is a dot filled with the colour of the tier it landed in.
 * The colour of a point is the information — the line only joins them up.
 */
export function RatingChart({ history }: { history: RatingPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [tipPos, setTipPos]   = useState<TipPos | null>(null)
  const narrow = useNarrow()

  const CW = narrow ? 390 : 860
  const CH = narrow ? 245 : 290
  const PL = narrow ? 40 : 52
  const PR = narrow ? 12 : 118
  const PT = narrow ? 20 : 22
  const PB = narrow ? 30 : 38
  const fsY = narrow ? 11 : 10
  const fsX = narrow ? 10 : 9

  const pw = CW - PL - PR, ph = CH - PT - PB

  if (history.length === 0) {
    return <div className="chart-empty">No rated contests yet — participate to build your rating graph</div>
  }

  // Sorted here rather than trusted from the caller: the series is a line, and
  // a line through points in the wrong order doubles back and reads as a loss
  // that never happened.
  const data = [...history].sort((a, b) => +new Date(a.date) - +new Date(b.date))

  const ratings = data.map(p => p.newRating)
  const rawMin = Math.min(...ratings), rawMax = Math.max(...ratings)
  const yPad   = Math.max(120, (rawMax - rawMin) * 0.35)
  const yMin   = Math.max(0, Math.floor((rawMin - yPad) / 100) * 100)
  const yMax   = Math.ceil((rawMax + yPad) / 100) * 100

  const now    = new Date()
  const lastTs = +new Date(data[data.length - 1].date)
  const xStart = new Date(data[0].date)
  xStart.setDate(1)
  xStart.setMonth(xStart.getMonth() - 1)
  const xMin   = xStart.getTime()
  // Never let a point sit beyond the right edge, where clamping would stack it
  // on top of whatever came before.
  const xMax   = Math.max(now.getTime(), lastTs)
  const xRange = Math.max(xMax - xMin, 1)

  const tx = (ts: number) => PL + Math.max(0, Math.min(1, (ts - xMin) / xRange)) * pw
  const ty = (r: number)  => PT + (1 - (r - yMin) / (yMax - yMin)) * ph

  const bands = TIERS.flatMap(t => {
    const lo = Math.max(t.min, yMin)
    const hi = Math.min(t.max === 9999 ? yMax : t.max, yMax)
    if (lo >= hi) return []
    return [{ ...t, y1: ty(hi), y2: ty(lo) }]
  })

  // Round 100s all the way up, thinned out so a wide range does not turn the
  // axis into a wall of numbers.
  const step = 100 * Math.max(1, Math.ceil((yMax - yMin) / 100 / 8))
  const yLabels: number[] = []
  for (let r = Math.ceil(yMin / step) * step; r < yMax; r += step) {
    if (r > yMin) yLabels.push(r)
  }

  const rangeMonths = Math.round(xRange / (30.44 * 86_400_000))
  const mStep = rangeMonths <= 6 ? 1 : rangeMonths <= 18 ? 2 : rangeMonths <= 36 ? 3 : 6
  const xLabels: { x: number; label: string }[] = []
  {
    let d = new Date(xStart.getFullYear(), xStart.getMonth() + 1, 1)
    const end = new Date(xMax)
    while (d <= end) {
      if (d.getMonth() % mStep === 0) {
        xLabels.push({
          x: tx(d.getTime()),
          label: d.toLocaleString('en', { month: 'short', ...(rangeMonths > 14 ? { year: '2-digit' } : {}) }),
        })
      }
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    }
  }

  const todayX = tx(now.getTime())
  const pts   = data.map(p => ({ x: tx(new Date(p.date).getTime()), y: ty(p.newRating) }))
  const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

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

  const hp    = hovered !== null ? data[hovered] : null
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
        </defs>

        {/* Tier bands — the background itself, not a wash over it */}
        <g clipPath="url(#rclip)">
          {bands.map(b => (
            <rect key={b.label} className="rc-band" x={PL} y={b.y1} width={pw}
              height={Math.max(0, b.y2 - b.y1)} fill={b.bg} />
          ))}
        </g>

        {/* Grid */}
        {yLabels.map(r => {
          const y = ty(r)
          return (
            <g key={r}>
              <line className="rc-grid" x1={PL} x2={PL + pw} y1={y} y2={y} />
              <text className="rc-axis-text" x={PL - 8} y={y + 3.5} textAnchor="end" fontSize={fsY}
                style={{ fontVariantNumeric: 'tabular-nums' }}>{r}</text>
            </g>
          )
        })}

        <rect className="rc-frame" x={PL} y={PT} width={pw} height={ph} fill="none" />

        {/* X-axis ticks + labels */}
        {xLabels.map(({ x, label }) => (
          <g key={label + x.toFixed(0)}>
            <line className="rc-frame" x1={x} x2={x} y1={PT + ph} y2={PT + ph + 4} />
            <text className="rc-axis-text" x={x} y={CH - 7} textAnchor="middle" fontSize={fsX}>{label}</text>
          </g>
        ))}

        {/* Today — the label hugs the line when the line is the right edge,
            which it usually is, rather than hanging half of itself outside. */}
        <line className="rc-today" x1={todayX} x2={todayX} y1={PT} y2={PT + ph} strokeDasharray="4,3" />
        <text className="rc-axis-text" x={todayX} y={PT - 7} fontSize={fsX}
          textAnchor={todayX > PL + pw - 22 ? 'end' : 'middle'}>Today</text>

        {/* Crosshair */}
        {hovered !== null && (
          <line className="rc-today" clipPath="url(#rclip)"
            x1={pts[hovered].x} x2={pts[hovered].x} y1={PT} y2={PT + ph} strokeDasharray="3,2" />
        )}

        {/* The series */}
        <g clipPath="url(#rclip)">
          <path className="rc-line" d={lineD} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {pts.map((pt, i) => {
            const tier = getTier(data[i].newRating)
            return (
              <circle key={i} className="rc-point" cx={pt.x} cy={pt.y}
                r={hovered === i ? 6.5 : 4.5}
                style={{ '--tier-fg': tier.fg, '--tier-bg': tier.bg } as React.CSSProperties}
                pointerEvents="none"
              />
            )
          })}
        </g>

        {/* Tier names — desktop only; on a phone the margin is better spent on the plot */}
        {!narrow && bands.map(b => {
          const mid = (b.y1 + b.y2) / 2
          if (b.y2 - b.y1 < 14) return null
          return (
            <text key={`lbl-${b.label}`} className="rc-tier-label"
              x={PL + pw + 9} y={mid + 3.5} fontSize={10} fontWeight={600}
              style={{ '--tier-fg': b.fg, '--tier-bg': b.bg } as React.CSSProperties}>{b.label}</text>
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
