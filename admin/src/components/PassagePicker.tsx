import { useMemo, useRef, useState } from 'react'
import { stripHtml } from './RichText'
import type { Passage } from '../lib/types'

/**
 * Choosing which passage a question belongs to.
 *
 * Replaces a <select>, which could only ever show one line of text per
 * option. In practice that meant a list like "5", "A", "T5", "T4" — because
 * a passage title is optional, so authors typed throwaway names — or sixty
 * truncated characters of body text, which cannot distinguish two cloze
 * passages that open with the same sentence.
 *
 * A popover can show what a dropdown cannot: a few lines of the passage, how
 * many questions already use it, and when it was made. That is what makes
 * picking the right one possible without opening another tab.
 */

function previewOf(p: Passage): string {
  if (p.type === 'TABLE' && p.tableData?.headers?.length) {
    return `Columns: ${p.tableData.headers.filter(Boolean).join(' · ')}`
  }
  return stripHtml(p.content).replace(/\s+/g, ' ').trim()
}

/** A title worth showing, falling back to the opening words of the passage. */
function labelOf(p: Passage): string {
  const t = p.title?.trim()
  if (t) return t
  const body = previewOf(p)
  return body ? `${body.slice(0, 48)}${body.length > 48 ? '…' : ''}` : 'Untitled passage'
}

function ago(iso?: string): string {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (!Number.isFinite(days) || days < 0) return ''
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

export default function PassagePicker({ passages, type, value, onChange, onCreateNew }: {
  passages: Passage[]
  /** TABLE questions attach to tables, everything else to text passages. */
  type: 'TEXT' | 'TABLE'
  value: string
  onChange: (id: string) => void
  /** Offered when nothing matches, so authoring is not a dead end. */
  onCreateNew?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  const eligible = useMemo(() => passages.filter(p => p.type === type), [passages, type])
  const selected = eligible.find(p => p.id === value) ?? null

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return eligible
    // Searches the body as well as the title, because the title is often the
    // least memorable thing about a passage.
    return eligible.filter(p =>
      labelOf(p).toLowerCase().includes(q) || previewOf(p).toLowerCase().includes(q))
  }, [eligible, query])

  const noun = type === 'TABLE' ? 'table' : 'passage'

  if (eligible.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        No {noun}s yet — create one in the Questions tab first.
      </p>
    )
  }

  return (
    <div className="pp-wrap" ref={boxRef}>
      <button type="button" className={`pp-trigger ${selected ? 'has' : ''}`}
        onClick={() => { setOpen(o => !o); setQuery('') }}>
        {selected ? (
          <span className="pp-sel">
            <span className="pp-sel-title">
              {selected.type === 'TABLE' ? '📊' : '📄'} {labelOf(selected)}
            </span>
            <span className="pp-sel-sub">
              {previewOf(selected).slice(0, 90)}{previewOf(selected).length > 90 ? '…' : ''}
            </span>
          </span>
        ) : (
          <span className="pp-placeholder">Choose a {noun}…</span>
        )}
        <span className="pp-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <>
          {/* Clicking anywhere else closes it, the way a native select does. */}
          <div className="pp-scrim" onClick={() => setOpen(false)} role="presentation" />
          <div className="pp-pop">
            <input className="input pp-search" autoFocus value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${eligible.length} ${noun}${eligible.length === 1 ? '' : 's'}…`} />

            <div className="pp-list">
              {matches.length === 0 && (
                <div className="pp-none">
                  Nothing matches “{query.trim()}”.
                  {onCreateNew && (
                    <button type="button" className="btn btn-sm btn-ghost"
                      onClick={() => { setOpen(false); onCreateNew() }}>
                      Create a new {noun}
                    </button>
                  )}
                </div>
              )}
              {matches.map(p => (
                <button key={p.id} type="button"
                  className={`pp-item ${p.id === value ? 'on' : ''}`}
                  onClick={() => { onChange(p.id); setOpen(false) }}>
                  <span className="pp-item-head">
                    <span className="pp-item-title">{p.type === 'TABLE' ? '📊' : '📄'} {labelOf(p)}</span>
                    {/* An unused passage is usually the one just created, and
                        a heavily used one is usually not the one wanted. */}
                    <span className={`pp-count ${(p.questionCount ?? 0) === 0 ? 'zero' : ''}`}>
                      {p.questionCount === undefined
                        ? ''
                        : p.questionCount === 0
                          ? 'unused'
                          : `${p.questionCount} question${p.questionCount === 1 ? '' : 's'}`}
                    </span>
                  </span>
                  <span className="pp-item-body">{previewOf(p).slice(0, 180) || <em>(empty)</em>}</span>
                  {ago(p.createdAt) && <span className="pp-item-when">{ago(p.createdAt)}</span>}
                </button>
              ))}
            </div>

            {value && (
              <button type="button" className="pp-clear" onClick={() => { onChange(''); setOpen(false) }}>
                Clear selection
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export { labelOf as passageLabel, previewOf as passagePreview }
