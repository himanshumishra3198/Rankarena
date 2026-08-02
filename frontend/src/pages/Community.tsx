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

        {error && <div className="card community-empty">{error}</div>}

        {loading ? (
          <div className="card community-empty">Loading…</div>
        ) : articles.length === 0 ? (
          <div className="card community-empty">
            <p>No articles here yet.</p>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/community/new')}>
              Write the first one
            </button>
          </div>
        ) : (
          <div className="article-list">
            {articles.map(a => {
              const tier = getTier(a.author.rating)
              return (
                <div key={a.id} className={`article-row ${a.pinned ? 'pinned' : ''}`}>
                  <VoteButtons
                    kind="articles"
                    id={a.id}
                    score={a.score}
                    myVote={a.myVote}
                    disabled={a.author.id === user.id}
                  />
                  <div className="article-row-body">
                    <div className="article-row-top">
                      {a.pinned && <span className="article-pin">📌 Pinned</span>}
                      <span className={`article-type article-type-${a.type.toLowerCase()}`}>
                        {TYPE_LABEL[a.type]}
                      </span>
                    </div>
                    <Link to={`/community/${a.id}`} className="article-title-link">
                      {a.title}
                    </Link>
                    <p className="article-excerpt">{a.excerpt}</p>
                    <div className="article-row-meta">
                      <Link
                        to={`/profile/${a.author.id}`}
                        className="article-author"
                        style={{ color: tier.fg }}
                      >
                        {a.author.name}
                      </Link>
                      <span className="comment-dot">·</span>
                      <span>{timeAgo(a.createdAt)}</span>
                      <span className="comment-dot">·</span>
                      <Link to={`/community/${a.id}`} className="article-comment-count">
                        💬 {a.commentCount}
                      </Link>
                    </div>
                  </div>
                </div>
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
