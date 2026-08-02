import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import VoteButtons from '../components/VoteButtons'
import api from '../lib/api'
import { timeAgo } from '../lib/time'
import { getTier } from '../lib/tiers'
import { usePageMeta } from '../lib/seo'
import type { ArticleListItem, ArticleType } from '../lib/types'

const TYPE_FILTERS: { value: '' | ArticleType; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'ANNOUNCEMENT', label: 'Announcements' },
  { value: 'TECHNIQUE', label: 'Tips & Tricks' },
  { value: 'EDITORIAL', label: 'Editorials' },
  { value: 'GENERAL', label: 'General' },
]

export const TYPE_LABEL: Record<ArticleType, string> = {
  GENERAL: 'General',
  ANNOUNCEMENT: 'Announcement',
  TECHNIQUE: 'Tip',
  EDITORIAL: 'Editorial',
}

// A leading glyph per category, so the feed is scannable at a glance even
// before the colour registers.
export const TYPE_ICON: Record<ArticleType, string> = {
  GENERAL: '💬',
  ANNOUNCEMENT: '📣',
  TECHNIQUE: '💡',
  EDITORIAL: '📖',
}



export default function Community() {
  usePageMeta('Community — RankArena', 'Contest announcements, techniques and discussion from the RankArena community.')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [articles, setArticles] = useState<ArticleListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const sort = params.get('sort') === 'top' ? 'top' : 'new'
  const type = params.get('type') || ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const user = JSON.parse(localStorage.getItem('user') || '{}')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .get('/community/articles', { params: { sort, type: type || undefined, page } })
      .then(({ data }) => {
        if (cancelled) return
        setArticles(data.articles)
        setTotal(data.total)
        setError('')
      })
      .catch(() => !cancelled && setError('Could not load articles.'))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [sort, type, page])

  // Changing a filter resets to page 1 — staying on page 4 of a new filter
  // usually lands on an empty list.
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next)
  }

  const totalPages = Math.max(1, Math.ceil(total / 20))

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="community-header">
          <div>
            <h1 style={{ marginBottom: 6 }}>Community</h1>
            <p className="community-sub">Contest announcements, techniques, and discussion.</p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/community/new')}>
            Write article
          </button>
        </div>

        <div className="community-controls">
          <div className="community-tabs">
            <button
              className={`community-tab ${sort === 'new' ? 'active' : ''}`}
              onClick={() => setParam('sort', 'new')}
            >
              Newest
            </button>
            <button
              className={`community-tab ${sort === 'top' ? 'active' : ''}`}
              onClick={() => setParam('sort', 'top')}
            >
              Top rated
            </button>
          </div>
          <div className="community-filters">
            {TYPE_FILTERS.map(f => (
              <button
                key={f.value}
                className={`community-chip ${type === f.value ? 'active' : ''}`}
                onClick={() => setParam('type', f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="card community-notice community-notice-error">{error}</div>}

        {loading ? (
          // Skeleton rows keep the layout from jumping when results land.
          <div className="article-list">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="article-row article-skeleton" aria-hidden="true">
                <div className="skeleton-vote" />
                <div className="article-row-body">
                  <div className="skeleton-line skeleton-pill" />
                  <div className="skeleton-line skeleton-title" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line skeleton-short" />
                </div>
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="card community-notice">
            <span className="community-empty-icon">✍️</span>
            <p className="community-empty-title">
              {type ? 'Nothing in this category yet' : 'The community is quiet right now'}
            </p>
            <p className="community-empty-sub">
              {type
                ? 'Try another category, or write the first post here.'
                : 'Share a shortcut you use, break down a tricky question, or ask the room.'}
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/community/new')}>
              Write the first article
            </button>
          </div>
        ) : (
          <div className="article-list">
            {articles.map(a => {
              const tier = getTier(a.author.rating)
              const isMine = a.author.id === user.id
              return (
                <article
                  key={a.id}
                  className={`article-row cat-${a.type.toLowerCase()} ${a.pinned ? 'pinned' : ''}`}
                >
                  <VoteButtons
                    kind="articles"
                    id={a.id}
                    score={a.score}
                    myVote={a.myVote}
                    disabled={isMine}
                  />
                  <div className="article-row-body">
                    <div className="article-row-top">
                      {a.pinned && <span className="article-pin">📌 Pinned</span>}
                      <span className="article-type">
                        {TYPE_ICON[a.type]} {TYPE_LABEL[a.type]}
                      </span>
                      {isMine && <span className="article-mine">Yours</span>}
                    </div>

                    <Link to={`/community/${a.id}`} className="article-title-link">
                      {a.title}
                    </Link>
                    <p className="article-excerpt">{a.excerpt}</p>

                    <div className="article-row-meta">
                      <Link to={`/profile/${a.author.id}`} className="article-byline">
                        <span
                          className="article-avatar"
                          style={{ background: tier.bg, color: tier.fg }}
                        >
                          {a.author.name[0].toUpperCase()}
                        </span>
                        <span className="article-author" style={{ color: tier.fg }}>
                          {a.author.name}
                        </span>
                      </Link>
                      {a.author.role === 'ADMIN' && <span className="article-admin-tag">Staff</span>}
                      <span className="comment-dot">·</span>
                      <span>{timeAgo(a.createdAt)}</span>
                      <span className="comment-dot">·</span>
                      <span>{a.readingMinutes} min read</span>
                      <Link to={`/community/${a.id}`} className="article-comment-count">
                        <span aria-hidden="true">💬</span>
                        {a.commentCount === 0
                          ? 'Comment'
                          : `${a.commentCount} ${a.commentCount === 1 ? 'comment' : 'comments'}`}
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="community-pagination">
            <button
              className="btn btn-ghost btn-sm"
              disabled={page <= 1}
              onClick={() => setParam('page', String(page - 1))}
            >
              ← Previous
            </button>
            <span className="community-page-label">Page {page} of {totalPages}</span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={page >= totalPages}
              onClick={() => setParam('page', String(page + 1))}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  )
}
