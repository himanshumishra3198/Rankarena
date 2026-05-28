import { useState } from 'react'

interface Props {
  onClose: () => void
}

type CalcOp = '+' | '-' | '×' | '÷' | null

function applyOp(a: number, b: number, op: CalcOp): number {
  if (op === '+') return a + b
  if (op === '-') return a - b
  if (op === '×') return a * b
  if (op === '÷') return b !== 0 ? a / b : 0
  return b
}

export default function Calculator({ onClose }: Props) {
  const [display, setDisplay] = useState('0')
  const [prev, setPrev] = useState<number | null>(null)
  const [op, setOp] = useState<CalcOp>(null)
  const [fresh, setFresh] = useState(false) // next digit starts a new number

  function inputDigit(d: string) {
    if (fresh) { setDisplay(d === '0' ? '0' : d); setFresh(false) }
    else setDisplay(display.length >= 12 ? display : display === '0' ? d : display + d)
  }

  function inputDot() {
    if (fresh) { setDisplay('0.'); setFresh(false); return }
    if (!display.includes('.')) setDisplay(display + '.')
  }

  function handleOp(nextOp: CalcOp) {
    const val = parseFloat(display)
    if (prev !== null && !fresh) {
      const result = applyOp(prev, val, op)
      const str = String(parseFloat(result.toFixed(10)))
      setDisplay(str)
      setPrev(result)
    } else {
      setPrev(val)
    }
    setOp(nextOp)
    setFresh(true)
  }

  function handleEquals() {
    if (op === null || prev === null) return
    const val = parseFloat(display)
    const result = applyOp(prev, val, op)
    setDisplay(String(parseFloat(result.toFixed(10))))
    setPrev(null)
    setOp(null)
    setFresh(true)
  }

  function clear() {
    setDisplay('0'); setPrev(null); setOp(null); setFresh(false)
  }

  function backspace() {
    if (fresh || display.length <= 1) { setDisplay('0'); return }
    setDisplay(display.slice(0, -1))
  }

  function toggleSign() {
    setDisplay(String(parseFloat(display) * -1))
  }

  function percent() {
    setDisplay(String(parseFloat(display) / 100))
  }

  const rows: string[][] = [
    ['C', '⌫', '%', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '−'],
    ['1', '2', '3', '+'],
    ['+/−', '0', '.', '='],
  ]

  function handleKey(key: string) {
    if (key >= '0' && key <= '9') return inputDigit(key)
    if (key === '.') return inputDot()
    if (key === '=') return handleEquals()
    if (key === 'C') return clear()
    if (key === '⌫') return backspace()
    if (key === '+/−') return toggleSign()
    if (key === '%') return percent()
    if (key === '÷') return handleOp('÷')
    if (key === '×') return handleOp('×')
    if (key === '−') return handleOp('-')
    if (key === '+') return handleOp('+')
  }

  function keyClass(key: string) {
    if (key === '=') return 'calc-key calc-key-eq'
    if (['÷', '×', '−', '+'].includes(key)) return `calc-key calc-key-op ${op && ['÷','×','−','+'].includes(key) && (op === key.replace('−','-') || op === key) && fresh ? 'active' : ''}`
    if (['C', '⌫', '%', '+/−'].includes(key)) return 'calc-key calc-key-fn'
    return 'calc-key'
  }

  return (
    <div className="calc-widget">
      <div className="calc-header">
        <span>Calculator</span>
        <button className="calc-close" onClick={onClose}>✕</button>
      </div>
      <div className="calc-display">
        {op && prev !== null && (
          <div className="calc-expr">{prev} {op}</div>
        )}
        <div className="calc-value">{display}</div>
      </div>
      <div className="calc-keys">
        {rows.map((row, i) => (
          <div key={i} className="calc-row">
            {row.map(key => (
              <button key={key} className={keyClass(key)} onClick={() => handleKey(key)}>
                {key}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
