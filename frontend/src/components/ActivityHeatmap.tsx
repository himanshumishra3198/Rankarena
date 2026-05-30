const CELL = 11, GAP = 2, STEP = CELL + GAP
const ROW_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

export function ActivityHeatmap({ heatmap }: { heatmap: Record<string, number> }) {
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

  const LEFT = 26, TOP = 16
  const svgW = LEFT + weeks.length * STEP
  const svgH = TOP + 7 * STEP

  function cellFill(date: Date): string {
    if (date > today) return 'transparent'
    const count = heatmap[date.toISOString().split('T')[0]] ?? 0
    if (count === 0) return '#ebedf0'
    if (count === 1) return '#c6e48b'
    if (count === 2) return '#7bc96f'
    if (count === 3) return '#239a3b'
    return '#196127'
  }

  return (
    <div className="heatmap-scroll">
      <svg width={svgW} height={svgH} style={{ display: 'block' }}>
        {ROW_LABELS.map((label, row) => label && (
          <text key={row} x={LEFT - 3} y={TOP + row * STEP + CELL - 1} textAnchor="end" fontSize={9} fill="#94a3b8">{label}</text>
        ))}
        {monthLabels.map(({ col, label }) => (
          <text key={`${col}-${label}`} x={LEFT + col * STEP} y={TOP - 4} fontSize={9} fill="#94a3b8">{label}</text>
        ))}
        {weeks.map((week, col) =>
          week.map((date, row) => (
            <rect key={`${col}-${row}`}
              x={LEFT + col * STEP} y={TOP + row * STEP}
              width={CELL} height={CELL} rx={2} fill={cellFill(date)}
            >
              <title>
                {date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' — '}{heatmap[date.toISOString().split('T')[0]] ?? 0} contest(s)
              </title>
            </rect>
          ))
        )}
      </svg>
    </div>
  )
}
