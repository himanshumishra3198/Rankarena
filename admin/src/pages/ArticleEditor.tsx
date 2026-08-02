import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import Markdown from '../components/Markdown'
import type { ArticleType } from '../lib/types'

// Announcements are the reason admins compose here at all, so this list leads
// with it — the student app offers the same choices minus ANNOUNCEMENT.
const TYPE_OPTIONS: { value: ArticleType; label: string; hint: string }[] = [
  { value: 'ANNOUNCEMENT', label: 'Announcement', hint: 'Official notice — upcoming contests, schedule changes, results.' },
  { value: 'EDITORIAL', label: 'Editorial', hint: 'Walkthrough of a contest or mock paper.' },
  { value: 'TECHNIQUE', label: 'Tip / Technique', hint: 'A shortcut or method students can reuse.' },
  { value: 'GENERAL', label: 'General', hint: 'Anything else.' },
]

const PLACEHOLDER = `Write the article here.

Markdown is supported:

# Heading
**bold**, *italic*, \`inline code\`

- bullet lists
1. numbered lists

> quoted text

[links](https://example.com)`

export default function ArticleEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState<ArticleType>('ANNOUNCEMENT')
  const [pinOnPublish, setPinOnPublish] = useState(false)
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(isEdit)

  useEffect(() => {
    if (!id) return
    api
      .get(`/community/articles/${id}`)
      .then(({ data }) => {
        setTitle(data.title)
        setBody(data.body)
        setType(data.type)
      })
      .catch(() => setError('Could not load this article.'))
      .finally(() => setLoading(false))
  }, [id])

  async function save() {
    if (saving) return
    if (title.trim().length < 3) { setError('Title must be at least 3 characters.'); return }
    if (!body.trim()) { setError('Body cannot be empty.'); return }

    setSaving(true)
    setError('')
    try {
      const payload = { title: title.trim(), body: body.trim(), type }
      const { data } = isEdit
        ? await api.patch(`/community/articles/${id}`, payload)
        : await api.post('/community/articles', payload)
      // Pinning is a separate toggle endpoint, so it only runs after the
      // article exists — a failure here shouldn't lose the written article.
      if (!isEdit && pinOnPublish) {
        try { await api.post(`/community/articles/${data.id}/pin`) } catch { /* still published */ }
      }
      navigate(`/community/${data.id}`)
    } catch (e: any) {
      const detail = e?.response?.data?.error
      setError(typeof detail === 'string' ? detail : 'Could not save the article.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <><Navbar /><div className="page"><p className="empty">Loading…</p></div></>
  }

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="page-header">
          <h1>{isEdit ? 'Edit article' : 'New article'}</h1>
        </div>

        <div className="card">
          <label className="mod-label" htmlFor="a-title">Title</label>
          <input
            id="a-title"
            className="input mod-field"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Weekly Contest #12 — Sunday 7 PM"
            maxLength={200}
          />

          <label className="mod-label">Category</label>
          <div className="mod-types">
            {TYPE_OPTIONS.map(o => (
              <button
                key={o.value}
                type="button"
                className={`mod-type ${type === o.value ? 'active' : ''}`}
                onClick={() => setType(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="mod-hint">{TYPE_OPTIONS.find(o => o.value === type)?.hint}</p>

          {!isEdit && (
            <label className="mod-checkbox">
              <input
                type="checkbox"
                checked={pinOnPublish}
                onChange={e => setPinOnPublish(e.target.checked)}
              />
              Pin to the top of the community feed
            </label>
          )}

          <div className="mod-body-head">
            <label className="mod-label" htmlFor="a-body">Body</label>
            <button type="button" className="mod-preview-toggle" onClick={() => setPreview(p => !p)}>
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>

          {preview ? (
            <div className="mod-preview">
              {body.trim() ? <Markdown source={body} /> : <p className="empty">Nothing to preview yet.</p>}
            </div>
          ) : (
            <textarea
              id="a-body"
              className="input mod-textarea"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={18}
            />
          )}

          {error && <p className="mod-error">{error}</p>}

          <div className="mod-actions">
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Publish'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => navigate(isEdit ? `/community/${id}` : '/community')}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
