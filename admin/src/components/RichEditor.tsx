import { useRef, useEffect, useState } from 'react'
import api from '../lib/api'

const COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0f172a']

// Keep only `color` in inline styles — strip background-color (and anything
// else) so pasted/legacy content doesn't show a white box in dark mode.
function cleanStyles(html: string): string {
  const tmp = document.createElement('div')
  tmp.innerHTML = html || ''
  tmp.querySelectorAll('[style]').forEach((node) => {
    const el = node as HTMLElement
    const color = el.style.color
    el.removeAttribute('style')
    if (color) el.style.color = color
  })
  return tmp.innerHTML
}

// Math / common symbols, grouped. These are plain Unicode characters that
// render natively for students once inserted into the question text.
const SYMBOL_GROUPS: { label: string; items: string[] }[] = [
  { label: 'Greek', items: ['α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'π', 'ρ', 'σ', 'τ', 'φ', 'ω', 'Δ', 'Σ', 'Ω', 'Π', 'Φ', 'Θ'] },
  { label: 'Operators', items: ['×', '÷', '±', '∓', '√', '∛', '∜', '∑', '∏', '∫', '∞', '∝', '≈', '≠', '≤', '≥', '≡', '°', '′', '″'] },
  { label: 'Geometry', items: ['△', '▭', '∠', '⊥', '∥', '∴', '∵', '→', '←', '↑', '↓', '↔', '⇒', '⇔', '∼', '≅'] },
  { label: 'Sets / Logic', items: ['∈', '∉', '⊂', '⊆', '⊃', '∪', '∩', '∅', '∀', '∃', '¬', '∧', '∨'] },
  { label: 'Fractions', items: ['½', '⅓', '⅔', '¼', '¾', '⅕', '⅛', '⅜'] },
  { label: 'Currency & misc', items: ['₹', '$', '€', '£', '¥', '%', '‰', '#', '∘', '·', '…'] },
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
  const fileRef = useRef<HTMLInputElement>(null)
  const [showSymbols, setShowSymbols] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Sync external value -> DOM only when not actively editing (avoids cursor
  // jumps). Strip stray backgrounds from loaded/legacy content so it renders
  // cleanly in the editor and gets saved clean.
  useEffect(() => {
    const el = ref.current
    if (!el || document.activeElement === el) return
    const cleaned = cleanStyles(value || '')
    if (el.innerHTML !== cleaned) el.innerHTML = cleaned
    if (cleaned !== (value || '')) onChange(cleaned)
  }, [value])

  function emit() { onChange(cleanStyles(ref.current?.innerHTML ?? '')) }

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

  // ── Image support ───────────────────────────────────────────────────
  async function uploadAndInsert(file: File) {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await api.post('/admin/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      ref.current?.focus()
      document.execCommand('insertHTML', false, `<img src="${res.data.url}" alt="" />&nbsp;`)
      emit()
    } catch {
      alert('Image upload failed.')
    } finally { setUploading(false) }
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) uploadAndInsert(f)
    e.target.value = ''
  }

  // Drag-and-drop an image onto the editor.
  function onDrop(e: React.DragEvent) {
    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'))
    if (file) { e.preventDefault(); uploadAndInsert(file) }
  }
  function onDragOver(e: React.DragEvent) {
    if (Array.from(e.dataTransfer.items).some(i => i.kind === 'file')) e.preventDefault()
  }

  // Paste: upload pasted images; otherwise insert plain text (strips stray
  // backgrounds/fonts so dark mode stays clean).
  function onPaste(e: React.ClipboardEvent) {
    const imgItem = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
    if (imgItem) {
      const file = imgItem.getAsFile()
      if (file) { e.preventDefault(); uploadAndInsert(file); return }
    }
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
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
        <button type="button" title="Insert image (or drag & drop / paste)"
          className="re-btn"
          onMouseDown={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? '…' : '🖼'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickImage} />
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
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={onDragOver}
      />
    </div>
  )
}
