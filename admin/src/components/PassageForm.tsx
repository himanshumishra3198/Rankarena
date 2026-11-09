import { useState } from 'react'
import api from '../lib/api'
import { stripHtml } from './RichText'
import type { Passage } from '../lib/types'

/**
 * Writing a passage or a data table.
 *
 * Lifted out of the Questions page so a paper can offer it too. Attaching a
 * comprehension to a mock used to mean leaving the mock, creating the
 * passage in the question bank, coming back, and finding it again in a list
 * — for something that exists only to carry the questions being written. The
 * form is the same wherever it appears; only where it saves to differs, and
 * that is nowhere, because a passage belongs to the bank regardless of which
 * screen made it.
 *
 * Self-contained: it owns its own save and hands the caller the saved
 * passage, so a host can select it immediately rather than re-fetching and
 * hunting for the new row.
 *
 * Deliberately not a <form>. Inside a paper it sits within the question's
 * own form, and a nested form is invalid HTML — the submit button fired the
 * outer form instead, which reset the question being written and saved no
 * passage at all. Validation that <form> would have done for free is done
 * here instead.
 */

export interface PassageFormValue {
  title: string
  content: string
  type: Passage['type']
  headers: string[]
  rows: string[][]
}

export const emptyPassageForm: PassageFormValue = {
  title: '',
  content: '',
  type: 'TEXT',
  headers: [''],
  rows: [['']],
}

/** Reads an existing passage back into the form. */
export function passageFormOf(p: Passage): PassageFormValue {
  return {
    title: p.title ?? '',
    content: p.content ?? '',
    type: p.type,
    headers: p.tableData?.headers ?? [''],
    rows: p.tableData?.rows ?? [['']],
  }
}

function errMsg(err: unknown, fallback: string): string {
  const e = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error
  if (typeof e === 'string') return e
  if (Array.isArray(e)) return e.map((i: { message?: string }) => i?.message).filter(Boolean).join(', ') || fallback
  return fallback
}

// ── Table builder ────────────────────────────────────────────────────────────
function TableBuilder({ headers, rows, onChange }: {
  headers: string[]; rows: string[][]
  onChange: (h: string[], r: string[][]) => void
}) {
  function setHeader(i: number, v: string) {
    const h = [...headers]; h[i] = v; onChange(h, rows)
  }
  function addCol() {
    onChange([...headers, ''], rows.map(r => [...r, '']))
  }
  function removeCol(i: number) {
    if (headers.length <= 1) return
    onChange(headers.filter((_, j) => j !== i), rows.map(r => r.filter((_, j) => j !== i)))
  }
  function setCell(ri: number, ci: number, v: string) {
    const r = rows.map(row => [...row]); r[ri][ci] = v; onChange(headers, r)
  }
  function addRow() {
    onChange(headers, [...rows, headers.map(() => '')])
  }
  function removeRow(i: number) {
    if (rows.length <= 1) return
    onChange(headers, rows.filter((_, j) => j !== i))
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ border: '1px solid var(--border)', padding: '4px 8px', background: 'var(--bg)' }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input className="input" value={h} onChange={e => setHeader(i, e.target.value)}
                    placeholder={`Col ${i + 1}`} style={{ fontSize: 12, padding: '2px 6px' }} />
                  <button type="button" onClick={() => removeCol(i)}
                    style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
              </th>
            ))}
            <th style={{ border: '1px solid var(--border)', padding: 4 }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={addCol}>+ Col</button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ border: '1px solid var(--border)', padding: 4 }}>
                  <input className="input" value={cell} onChange={e => setCell(ri, ci, e.target.value)}
                    style={{ fontSize: 12, padding: '2px 6px' }} />
                </td>
              ))}
              <td style={{ border: '1px solid var(--border)', padding: 4 }}>
                <button type="button" onClick={() => removeRow(ri)}
                  style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={addRow}>+ Row</button>
    </div>
  )
}

export default function PassageForm({ editingId, initial, onSaved, onCancel, compact }: {
  /** Set when editing an existing passage rather than writing a new one. */
  editingId?: string | null
  initial?: PassageFormValue
  /** Handed the saved passage, so a host can select it straight away. */
  onSaved: (passage: Passage) => void
  onCancel: () => void
  /** Inside a paper, where the form is a step and not the page. */
  compact?: boolean
}) {
  const [form, setForm] = useState<PassageFormValue>(initial ?? emptyPassageForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    // What `required` used to enforce, now that there is no form around it.
    if (form.type === 'TEXT' && !form.content.trim()) {
      setError('Passage text is required.')
      return
    }
    if (form.type === 'TABLE' && !form.headers.some(h => h.trim())) {
      setError('A table needs at least one column heading.')
      return
    }
    setSaving(true); setError('')
    try {
      const payload = {
        title: form.title,
        content: form.content,
        type: form.type,
        tableData: form.type === 'TABLE' ? { headers: form.headers, rows: form.rows } : null,
      }
      const { data } = editingId
        ? await api.put<Passage>(`/admin/passages/${editingId}`, payload)
        : await api.post<Passage>('/admin/passages', payload)
      onSaved(data)
    } catch (err) {
      setError(errMsg(err, 'Failed to save passage'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={compact ? 'pf-compact' : undefined}>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-row">
        <div className="form-group">
          <label>Type</label>
          <select className="input" value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value as Passage['type'] }))}>
            <option value="TEXT">Reading Passage</option>
            <option value="TABLE">Data Table</option>
          </select>
        </div>
        <div className="form-group" style={{ flex: 2 }}>
          <label>Title / Description (shown above the passage)</label>
          <input className="input" value={form.title} placeholder="e.g. RC — the Indian monsoon"
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          {/* Optional, because it is shown to candidates and a bad title is
              worse than none. But an untitled passage is identified only by
              its opening words, and cloze and RC passages all open with the
              same instruction — which is how a passage list comes to read
              "5", "A", "T5". */}
          {!form.title.trim() && stripHtml(form.content).trim().length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>
              Without a title this passage is listed by its opening words. Two passages that
              begin “In the following passage, some words have been deleted…” will look
              identical when you attach a question to one of them.
            </div>
          )}
        </div>
      </div>

      {form.type === 'TEXT' ? (
        <div className="form-group">
          <label>Passage Text</label>
          <textarea className="input" rows={compact ? 5 : 6} value={form.content}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            style={{ resize: 'vertical', fontFamily: 'inherit' }} />
        </div>
      ) : (
        <div className="form-group">
          <label>Table Data</label>
          <div className="form-group">
            <label style={{ fontSize: 12 }}>Short description (optional)</label>
            <input className="input" value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="e.g. The following table shows total candidates and present candidates..." />
          </div>
          <TableBuilder
            headers={form.headers}
            rows={form.rows}
            onChange={(h, r) => setForm(f => ({ ...f, headers: h, rows: r }))}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        {/* type="button" throughout: a submit button here would belong to
            whatever form encloses this, which inside a paper is the question
            being written. */}
        <button className="btn btn-primary" type="button" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : editingId ? 'Update Passage' : 'Save Passage'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
