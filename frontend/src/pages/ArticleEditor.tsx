import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Markdown from '../components/Markdown'
import api from '../lib/api'
import { usePageMeta } from '../lib/seo'
import type { ArticleType } from '../lib/types'

const TYPE_OPTIONS: { value: ArticleType; label: string; hint: string; adminOnly?: boolean }[] = [
  { value: 'GENERAL', label: 'General', hint: 'Discussion, questions, anything else.' },
  { value: 'TECHNIQUE', label: 'Tip / Technique', hint: 'A shortcut or method others can reuse.' },
  { value: 'EDITORIAL', label: 'Editorial', hint: 'A walkthrough of contest or mock questions.' },
  { value: 'ANNOUNCEMENT', label: 'Announcement', hint: 'Official notice about an upcoming contest.', adminOnly: true },
]

const PLACEHOLDER = `Write your article here.

Markdown is supported:

# Heading
**bold**, *italic*, \`inline code\`

- bullet lists
1. numbered lists

> quoted text

\`\`\`
code blocks
\`\`\`

[links](https://example.com)`

export default function ArticleEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)
  usePageMeta(isEdit ? 'Edit article — RankArena' : 'Write an article — RankArena')

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isAdmin = user.role === 'ADMIN'

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState<ArticleType>('GENERAL')
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(isEdit)

  useEffect(() => {
    if (!id) return
    api
      .get(`/community/articles/${id}`)
      .then(({ data }) => {
        if (!data.canModify) {
          setError('You can only edit your own articles.')
          return
        }
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
    if (!body.trim()) { setError('Article body cannot be empty.'); return }

    setSaving(true)
    setError('')
    try {
      const payload = { title: title.trim(), body: body.trim(), type }
      const { data } = isEdit
        ? await api.patch(`/community/articles/${id}`, payload)
        : await api.post('/community/articles', payload)
      navigate(`/community/${data.id}`)
    } catch (e: any) {
      const detail = e?.response?.data?.error
      setError(typeof detail === 'string' ? detail : 'Could not save the article.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="page"><p className="empty">Loading…</p></div>
      </>
    )
  }

  return (
    <>
      <Navbar />
      <div className="page">
        <h1 style={{ marginBottom: 6 }}>{isEdit ? 'Edit article' : 'Write an article'}</h1>
        <p className="community-sub">
          Share a technique, post an editorial, or start a discussion.
        </p>

        <div className="card editor-card">
          <label className="editor-label" htmlFor="article-title">Title</label>
          <input
            id="article-title"
            className="input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="A clear, specific title"
            maxLength={200}
          />

          <label className="editor-label">Category</label>
          <div className="editor-types">
            {TYPE_OPTIONS.filter(o => !o.adminOnly || isAdmin).map(o => (
              <button
                key={o.value}
                type="button"
                className={`editor-type ${type === o.value ? 'active' : ''}`}
                onClick={() => setType(o.value)}
                title={o.hint}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="editor-hint">{TYPE_OPTIONS.find(o => o.value === type)?.hint}</p>

          <div className="editor-body-head">
            <label className="editor-label" htmlFor="article-body">Body</label>
            <button
              type="button"
              className="editor-preview-toggle"
              onClick={() => setPreview(p => !p)}
            >
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>

          {preview ? (
            <div className="editor-preview">
              {body.trim()
                ? <Markdown source={body} />
                : <p className="empty">Nothing to preview yet.</p>}
            </div>
          ) : (
            <textarea
              id="article-body"
              className="input editor-textarea"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={18}
            />
          )}

          {error && <p className="editor-error">{error}</p>}

          <div className="editor-actions">
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Publish article'}
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
