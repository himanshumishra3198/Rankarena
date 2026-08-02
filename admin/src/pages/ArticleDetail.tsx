import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import Markdown from '../components/Markdown'
import { timeAgo } from '../lib/time'
import type { Article, ArticleComment } from '../lib/types'
import { TYPE_LABEL } from './Community'

// Comments arrive flat; indent by walking parentId so moderators can see which
// reply sits under which comment without rebuilding the student-side thread UI.
function depthOf(c: ArticleComment, byId: Map<string, ArticleComment>): number {
  let depth = 0
  let cursor = c.parentId ? byId.get(c.parentId) : undefined
  while (cursor && depth < 8) {
    depth++
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  return depth
}

export default function ArticleDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [article, setArticle] = useState<Article | null>(null)
  const [comments, setComments] = useState<ArticleComment[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const [a, c] = await Promise.all([
        api.get(`/community/articles/${id}`),
        api.get(`/community/articles/${id}/comments`),
      ])
      setArticle(a.data)
      setComments(c.data)
    } catch {
      setMissing(true)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function togglePin() {
    setBusy('pin')
    try {
      const { data } = await api.post(`/community/articles/${id}/pin`)
      setArticle(a => (a ? { ...a, pinned: data.pinned } : a))
    } catch {
      setError('Could not change the pin.')
    } finally {
      setBusy(null)
    }
  }

  async function removeArticle() {
    if (!article) return
    if (!window.confirm(`Delete "${article.title}"? Its comments go with it.`)) return
    try {
      await api.delete(`/community/articles/${id}`)
      navigate('/community')
    } catch {
      setError('Could not delete the article.')
    }
  }

  async function removeComment(commentId: string) {
    if (!window.confirm('Delete this comment? Replies to it will stay.')) return
    setBusy(commentId)
    try {
      await api.delete(`/community/comments/${commentId}`)
      await load()
    } catch {
      setError('Could not delete the comment.')
    } finally {
      setBusy(null)
    }
  }

  if (missing) {
    return (
      <>
        <Navbar />
        <div className="page"><p className="empty">This article no longer exists.</p></div>
      </>
    )
  }
  if (!article) {
    return <><Navbar /><div className="page"><p className="empty">Loading…</p></div></>
  }

  const byId = new Map(comments.map(c => [c.id, c]))
  const liveComments = comments.filter(c => !c.deleted).length

  return (
    <>
      <Navbar />
      <div className="page">
        <button className="mod-back" onClick={() => navigate('/community')}>← Community</button>

        <div className="card">
          <div className="mod-row-top">
            {article.pinned && <span className="badge badge-scheduled">📌 Pinned</span>}
            <span className="badge badge-ended">{TYPE_LABEL[article.type]}</span>
            <span className={`mod-score ${article.score < 0 ? 'negative' : article.score > 0 ? 'positive' : ''}`}>
              {article.score > 0 ? `+${article.score}` : article.score}
            </span>
          </div>

          <h1 className="mod-article-title">{article.title}</h1>
          <p className="mod-meta">
            {article.author.name} · rating {article.author.rating}
            {article.author.role === 'ADMIN' && <span className="mod-admin-tag">admin</span>}
            {' · '}{timeAgo(article.createdAt)}
            {article.updatedAt !== article.createdAt && ' · edited'}
          </p>

          <Markdown source={article.body} className="mod-article-body" />

          {error && <p className="mod-error">{error}</p>}

          <div className="mod-actions">
            <button className="btn btn-ghost btn-sm" onClick={togglePin} disabled={busy === 'pin'}>
              {article.pinned ? 'Unpin' : 'Pin to top'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/community/${id}/edit`)}>
              Edit
            </button>
            <button className="btn btn-ghost btn-sm mod-danger" onClick={removeArticle}>
              Delete article
            </button>
          </div>
        </div>

        <div className="card">
          <h2 className="mod-section-title">
            Comments <span className="mod-meta">({liveComments} live, {comments.length} total)</span>
          </h2>

          {comments.length === 0 ? (
            <p className="empty">No comments on this article.</p>
          ) : (
            <div className="mod-comments">
              {comments.map(c => (
                <div
                  key={c.id}
                  className={`mod-comment ${c.deleted ? 'mod-comment-deleted' : ''}`}
                  style={{ marginLeft: depthOf(c, byId) * 20 }}
                >
                  <div className="mod-comment-head">
                    <span className="mod-comment-author">
                      {c.deleted ? '[deleted]' : c.author?.name}
                    </span>
                    {!c.deleted && c.author?.role === 'ADMIN' && (
                      <span className="mod-admin-tag">admin</span>
                    )}
                    <span className="mod-meta">
                      · {timeAgo(c.createdAt)} · score {c.score > 0 ? `+${c.score}` : c.score}
                    </span>
                    {!c.deleted && (
                      <button
                        className="mod-comment-delete"
                        disabled={busy === c.id}
                        onClick={() => removeComment(c.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {c.deleted ? (
                    <p className="mod-meta">This comment was deleted.</p>
                  ) : (
                    <Markdown source={c.body} className="mod-comment-body" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
