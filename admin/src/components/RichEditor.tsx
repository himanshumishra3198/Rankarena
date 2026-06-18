import { useRef, useEffect, useState } from 'react'

const COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0f172a']

// Math / common symbols, grouped. These are plain Unicode characters that
// render natively for students once inserted into the question text.
const SYMBOL_GROUPS: { label: string; items: string[] }[] = [
  { label: 'Greek', items: ['α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'π', 'ρ', 'σ', 'τ', 'φ', 'ω', 'Δ', 'Σ', 'Ω', 'Π', 'Φ', 'Θ'] },
  { label: 'Operators', items: ['×', '÷', '±', '∓', '√', '∛', '∜', '∑', '∏', '∫', '∞', '∝', '≈', '≠', '≤', '≥', '≡', '°', '′', '″'] },
  { label: 'Geometry', items: ['△', '▭', '∠', '⊥', '∥', '∴', '∵', '→', '←', '↑', '↓', '↔', '⇒', '⇔', '∼', '≅'] },
  { label: 'Sets / Logic', items: ['∈', '∉', '⊂', '⊆', '⊃', '∪', '∩', '∅', '∀', '∃', '¬', '∧', '∨'] },
  { label: 'Fractions', items: ['½', '⅓', '⅔', '¼', '¾', '⅕', '⅛', '⅜'] },
]

// Lightweight WordPad-style editor: contentEditable + execCommand.
// Produces simple inline HTML (b/i/u/sub/sup/span[color]) stored as a string.
export function RichEditor({ value, onChange, placeholder, minHeight = 70, singleLine = false }: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  singleLine?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [showSymbols, setShowSymbols] = useState(false)

  // Sync external value -> DOM only when not actively editing (avoids cursor jumps).
  useEffect(() => {
    const el = ref.current
    if (el && document.activeElement !== el && el.innerHTML !== (value || '')) {
      el.innerHTML = value || ''
    }
  }, [value])

  function emit() { onChange(ref.current?.innerHTML ?? '') }

  function exec(cmd: string, arg?: string) {
    ref.current?.focus()
    document.execCommand(cmd, false, arg)
    emit()
  }

  // Insert a symbol at the caret (keeps the editor's existing selection).
  function insertSymbol(sym: string) {
    ref.current?.focus()
    document.execCommand('insertText', false, sym)
    emit()
  }

  const btn = (label: React.ReactNode, cmd: string, arg?: string, title?: string, extra?: React.CSSProperties) => (
    <button type="button" title={title} className="re-btn" style={extra}
      // preventDefault keeps the text selection inside the editor when clicking
      onMouseDown={e => e.preventDefault()}
      onClick={() => exec(cmd, arg)}>
      {label}
    </button>
  )

  return (
    <div className="rich-editor">
      <div className="re-toolbar">
        {btn(<b>B</b>, 'bold', undefined, 'Bold')}
        {btn(<i>I</i>, 'italic', undefined, 'Italic')}
        {btn(<u>U</u>, 'underline', undefined, 'Underline')}
        <span className="re-sep" />
        {btn(<span>x<sub>2</sub></span>, 'subscript', undefined, 'Subscript')}
        {btn(<span>x<sup>2</sup></span>, 'superscript', undefined, 'Superscript')}
        <span className="re-sep" />
        {COLORS.map(c => btn('A', 'foreColor', c, `Color ${c}`, { color: c, fontWeight: 800 }))}
        <span className="re-sep" />
        {btn('⌫', 'removeFormat', undefined, 'Clear formatting')}
        <span className="re-sep" />
        <button type="button" title="Insert math symbol"
          className={`re-btn ${showSymbols ? 'active' : ''}`}
          onMouseDown={e => e.preventDefault()}
          onClick={() => setShowSymbols(s => !s)}>
          √x ▾
        </button>
      </div>

      {showSymbols && (
        <div className="re-symbols">
          {SYMBOL_GROUPS.map(g => (
            <div key={g.label} className="re-sym-group">
              <div className="re-sym-label">{g.label}</div>
              <div className="re-sym-grid">
                {g.items.map(s => (
                  <button key={s} type="button" className="re-sym"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => insertSymbol(s)}>{s}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        ref={ref}
        className="re-content input"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        style={{ minHeight: singleLine ? undefined : minHeight }}
        onInput={emit}
        onBlur={emit}
      />
    </div>
  )
}
