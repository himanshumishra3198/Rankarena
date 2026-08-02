import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Markdown from '../components/Markdown'
import VoteButtons from '../components/VoteButtons'
import CommentThread from '../components/CommentThread'
import api from '../lib/api'
import { timeAgo } from '../lib/time'
import { getTier } from '../lib/tiers'
import { usePageMeta } from '../lib/seo'
import type { Article, ArticleComment } from '../lib/types'
import { TYPE_LABEL } from './Community'

export default function ArticleView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [article, setArticle] = useState<Article | null>(null)
  const [comments, setComments] = useState<ArticleComment[]>([])
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  usePageMeta(article ? `${article.title} — RankArena` : 'Article — RankArena')

  const loadComments = useCallback(async () => {
    if (!id) return
    const { data } = await api.get(`/community/articles/${id}/comments`)
    setComments(data)
  }, [id])

  // Edits and deletes inside the thread can change the comment count, so pull
  // the article header back down alongside the thread itself.
  const refresh = useCallback(async () => {
    if (!id) return
    const [{ data: fresh }] = await Promise.all([
      api.get(`/community/articles/${id}`),
      loadComments(),
    ])
    setArticle(fresh)
  }, [id, loadComments])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    api
      .get(`/community/articles/${id}`)
      .then(({ data }) => !cancelled && setArticle(data))
      .catch(() => !cancelled && setNotFound(true))
    loadComments().catch(() => {})
    return () => { cancelled = true }
  }, [id, loadComments])

  async function postComment(parentId: string | null, body: string) {
    await api.post(`/community/articles/${id}/comments`, { body, parentId })
    await loadComments()
    // Keep the header count in step without refetching the whole article.
    setArticle(a => (a ? { ...a, commentCount: a.commentCount + 1 } : a))
  }

  async function submitTopLevel() {
    if (!draft.trim() || posting) return
    setPosting(true)
    setError('')
    try {
      await postComment(null, draft.trim())
      setDraft('')
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not post comment')
    } finally {
      setPosting(false)
    }
  }

  async function removeArticle() {
    if (!window.confirm('Delete this article and all of its comments?')) return
    try {
      await api.delete(`/community/articles/${id}`)
      navigate('/community')
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not delete article')
    }
  }

  async function togglePin() {
    try {
      const { data } = await api.post(`/community/articles/${id}/pin`)
      setArticle(a => (a ? { ...a, pinned: data.pinned } : a))
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not pin')
    }
  }

  if (notFound) {
    return (
      <>
        <Navbar />
        <div className="page">
          <div className="card community-empty">
            <p>This article no longer exists.</p>
            <Link to="/community" className="btn btn-primary btn-sm">Back to Community</Link>
          </div>
        </div>
      </>
    )
  }

  if (!article) {
    return (
      <>
        <Navbar />
        <div className="page"><p className="empty">Loading…</p></div>
      </>
    )
  }

  const tier = getTier(article.author.rating)

  return (
    <>
      <Navbar />
      <div className="page">
        <Link to="/community" className="article-back">← Community</Link>

        <article className="card article-full">
          <div className="article-full-head">
            <VoteButtons
              kind="articles"
              id={article.id}
              score={article.score}
              myVote={article.myVote}
              disabled={article.author.id === user.id}
            />
            <div className="article-full-headtext">
              <div className="article-row-top">
                {article.pinned && <span className="article-pin">📌 Pinned</span>}
                <span className={`article-type article-type-${article.type.toLowerCase()}`}>
                  {TYPE_LABEL[article.type]}
                </span>
              </div>
              <h1 className="article-full-title">{article.title}</h1>
              <div className="article-row-meta">
                <Link
                  to={`/profile/${article.author.id}`}
                  className="article-author"
                  style={{ color: tier.fg }}
                >
                  {article.author.name}
                </Link>
                <span className="comment-dot">·</span>
                <span>{timeAgo(article.createdAt)}</span>
                {article.updatedAt !== article.createdAt && (
                  <span className="comment-edited">(edited)</span>
                )}
              </div>
            </div>
          </div>

          <Markdown source={article.body} className="article-full-body" />

          {(article.canModify || user.role === 'ADMIN') && (
            <div className="article-owner-actions">
              {article.canModify && (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigate(`/community/${article.id}/edit`)}
                  >
                    Edit
                  </button>
                  <button className="btn btn-ghost btn-sm article-danger" onClick={removeArticle}>
                    Delete
                  </button>
                </>
              )}
              {user.role === 'ADMIN' && (
                <button className="btn btn-ghost btn-sm" onClick={togglePin}>
                  {article.pinned ? 'Unpin' : 'Pin to top'}
                </button>
              )}
            </div>
          )}
        </article>

        <section className="card article-comments">
          <h2 className="article-comments-title">
            {article.commentCount} {article.commentCount === 1 ? 'comment' : 'comments'}
          </h2>

          <div className="comment-editor">
            <textarea
              className="input comment-textarea"
              placeholder="Add a comment… (Markdown supported)"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={4}
            />
            <div className="comment-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={submitTopLevel}
                disabled={posting || !draft.trim()}
              >
                {posting ? 'Posting…' : 'Post comment'}
              </button>
            </div>
          </div>

          {error && <p className="comment-error">{error}</p>}

          <CommentThread
            comments={comments}
            currentUserId={user.id}
            onReply={postComment}
            onChanged={refresh}
          />
        </section>
      </div>
    </>
  )
}
