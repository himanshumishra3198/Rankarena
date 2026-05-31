import { useState } from 'react'

const CELL = 12, GAP = 3, STEP = CELL + GAP
const ROW_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']
const GREEN = ['#c6e48b', '#7bc96f', '#239a3b', '#196127']

interface TooltipState { x: number; y: number; date: string; count: number }

export function ActivityHeatmap({ heatmap }: { heatmap: Record<string, number> }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const start = new Date(today)
  start.setDate(start.getDate() - 52 * 7)
  start.setDate(start.getDate() - start.getDay())

  const weeks: Date[][] = []
  const cur = new Date(start)
  while (cur <= today) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) { week.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }
    weeks.push(week)
  }

  const monthLabels: { col: number; label: string }[] = []
  let lastMon = -1
  weeks.forEach((week, col) => {
    const m = week[0].getMonth()
    if (m !== lastMon) {
      monthLabels.push({ col, label: week[0].toLocaleString('en', { month: 'short' }) })
      lastMon = m
    }
  })

  const LEFT = 28, TOP = 18
  const svgW = LEFT + weeks.length * STEP
  const svgH = TOP + 7 * STEP

  return (
    <div className="heatmap-scroll" style={{ position: 'relative' }}>
      <svg
        width={svgW} height={svgH}
        style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setTooltip(null)}
      >
        {ROW_LABELS.map((label, row) => label && (
          <text key={row} x={LEFT - 4} y={TOP + row * STEP + CELL - 1}
            textAnchor="end" fontSize={9} fill="#94a3b8">{label}</text>
        ))}
        {monthLabels.map(({ col, label }) => (
          <text key={`${col}-${label}`} x={LEFT + col * STEP} y={TOP - 5}
            fontSize={9} fill="#94a3b8">{label}</text>
        ))}
        {weeks.map((week, col) =>
          week.map((date, row) => {
            if (date > today) return null
            const dateStr = date.toISOString().split('T')[0]
            const count = heatmap[dateStr] ?? 0
            // Use inline style so CSS variables resolve correctly in both themes
            const fill = count === 0
              ? 'var(--heatmap-empty)'
              : GREEN[Math.min(count - 1, GREEN.length - 1)]
            return (
              <rect
                key={`${col}-${row}`}
                x={LEFT + col * STEP} y={TOP + row * STEP}
                width={CELL} height={CELL} rx={2}
                style={{ fill, cursor: 'default' }}
                onMouseEnter={(e) => {
                  const rectBox = (e.currentTarget as SVGRectElement).getBoundingClientRect()
                  const wrap = (e.currentTarget.closest('.heatmap-scroll') as HTMLElement).getBoundingClientRect()
                  setTooltip({
                    x: rectBox.left - wrap.left + CELL / 2,
                    y: rectBox.top - wrap.top - 8,
                    date: date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
                    count,
                  })
                }}
              />
            )
          })
        )}
      </svg>

      {tooltip && (
        <div className="heatmap-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div className="heatmap-tooltip-count">
            {tooltip.count === 0 ? 'No contests' : `${tooltip.count} contest${tooltip.count > 1 ? 's' : ''}`}
          </div>
          <div className="heatmap-tooltip-date">{tooltip.date}</div>
        </div>
      )}
    </div>
  )
}
