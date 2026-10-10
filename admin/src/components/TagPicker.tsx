import { useEffect, useMemo, useState } from 'react'
import api from '../lib/api'
import type { Exam, Tag, TagCategory } from '../lib/types'

/**
 * Attaching reusable labels to a question.
 *
 * Tags are referenced by id, so this picker never sends a name: it either
 * selects an existing tag or creates one and then selects it. That is what
 * stops "Time & Work" and "Time and Work" becoming two topics, which is the
 * failure the free-text topic field had.
 *
 * Only tags that apply to the question's exam are offered — plus the ones
 * with no exam, which apply to all of them.
 */

const CATEGORY_LABELS: Record<TagCategory, string> = {
  TOPIC: 'Topic',
  SUBTOPIC: 'Subtopic',
  DIFFICULTY: 'Difficulty',
  SKILL: 'Skill',
  QUESTION_TYPE: 'Question type',
  CUSTOM: 'Custom',
}

const CATEGORY_COLORS: Record<TagCategory, string> = {
  TOPIC: '#7c3aed',
  SUBTOPIC: '#0ea5e9',
  DIFFICULTY: '#f59e0b',
  SKILL: '#16a34a',
  QUESTION_TYPE: '#db2777',
  CUSTOM: '#64748b',
}

export function TagChip({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
  const colour = CATEGORY_COLORS[tag.category] ?? CATEGORY_COLORS.CUSTOM
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      border: `1px solid ${colour}`, color: colour,
      background: `${colour}14`,
      borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600,
      opacity: tag.active === false ? 0.55 : 1,
    }}>
      {tag.name}
      {tag.active === false && <span style={{ fontWeight: 400 }}>(retired)</span>}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${tag.name}`}
          style={{
            border: 0, background: 'none', color: 'inherit', cursor: 'pointer',
            fontSize: 14, lineHeight: 1, padding: 0,
          }}>×</button>
      )}
    </span>
  )
}

/** Fetches the tag vocabulary for one exam, once per exam per session. */
const cache = new Map<string, Tag[]>()

export function useTags(exam: Exam | null) {
  const key = exam ?? 'ALL'
  const [tags, setTags] = useState<Tag[]>(cache.get(key) ?? [])
  const [loading, setLoading] = useState(!cache.has(key))

  useEffect(() => {
    if (cache.has(key)) { setTags(cache.get(key)!); setLoading(false); return }
    let live = true
    setLoading(true)
    api.get<Tag[]>('/admin/tags', { params: exam ? { exam } : {} })
      .then(r => {
        cache.set(key, r.data)
        if (live) { setTags(r.data); setLoading(false) }
      })
      .catch(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [key, exam])

  // So a tag created mid-session shows up without a reload.
  const add = (tag: Tag) => {
    const next = [...(cache.get(key) ?? []), tag]
    cache.set(key, next)
    setTags(next)
  }

  return { tags, loading, add }
}

export default function TagPicker({ exam, value, onChange }: {
  exam: Exam
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const { tags, loading, add } = useTags(exam)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<TagCategory>('TOPIC')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const byId = useMemo(() => new Map(tags.map(t => [t.id, t])), [tags])
  const selected = value.map(id => byId.get(id)).filter(Boolean) as Tag[]

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tags
      .filter(t => !value.includes(t.id))
      // A retired tag stays on the questions that carry it but is not offered
      // for new ones.
      .filter(t => t.active !== false)
      .filter(t => !q || t.name.toLowerCase().includes(q))
      .slice(0, 40)
  }, [tags, query, value])

  // Only offer to create when nothing already matches what was typed — the
  // whole point is to reuse a tag rather than make a near-duplicate.
  const typed = query.trim()
  const exact = tags.some(t => t.name.trim().toLowerCase() === typed.toLowerCase())
  const canCreate = typed.length > 0 && !exact

  async function create() {
    setCreating(true); setError('')
    try {
      const { data } = await api.post<Tag>('/admin/tags', { name: typed, category, exam })
      add(data)
      onChange([...value, data.id])
      setQuery('')
    } catch (err) {
      const res = (err as { response?: { data?: { error?: string; duplicate?: { id: string } } } }).response
      // The server returns the existing row on a collision, so select that
      // instead of showing an error the admin can do nothing about.
      if (res?.data?.duplicate?.id) {
        onChange([...value, res.data.duplicate.id])
        setQuery('')
      } else {
        setError(res?.data?.error ?? 'Could not create that tag.')
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="form-group">
      <label>
        Tags{' '}
        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
          (topic, subtopic, skill — used to filter the bank and build practice sets)
        </span>
      </label>

      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '4px 0 8px' }}>
          {selected.map(t => (
            <TagChip key={t.id} tag={t} onRemove={() => onChange(value.filter(id => id !== t.id))} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input" value={query} onChange={e => setQuery(e.target.value)}
          placeholder={loading ? 'Loading tags…' : 'Search tags, or type a new one'} />
        {canCreate && (
          <>
            <select className="input" style={{ maxWidth: 150 }} value={category}
              onChange={e => setCategory(e.target.value as TagCategory)}>
              {(Object.keys(CATEGORY_LABELS) as TagCategory[]).map(c => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
            <button type="button" className="btn btn-sm" disabled={creating} onClick={create}>
              {creating ? 'Creating…' : `Create "${typed}"`}
            </button>
          </>
        )}
      </div>

      {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{error}</div>}

      {query.trim() !== '' && matches.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {matches.map(t => (
            <button key={t.id} type="button" onClick={() => { onChange([...value, t.id]); setQuery('') }}
              style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer' }}>
              <TagChip tag={t} />
            </button>
          ))}
        </div>
      )}

      {query.trim() === '' && !loading && tags.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          No tags yet for this exam. Type a name above to create the first one.
        </div>
      )}
    </div>
  )
}
