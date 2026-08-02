import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import { timeAgo } from '../lib/time'
import type { ArticleListItem, ArticleType } from '../lib/types'

const TYPE_TABS: { value: '' | ArticleType; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'ANNOUNCEMENT', label: 'Announcements' },
  { value: 'TECHNIQUE', label: 'Tips' },
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
  const navigate = useNavigate()
  const [articles, setArticles] = useState<ArticleListItem[]>([])
  const [type, setType] = useState<'' | ArticleType>('')
  const [sort, setSort] = useState<'new' | 'top'>('new')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get('/community/articles', {
        params: { sort, type: type || undefined, page },
      })
      setArticles(res.data.articles)
      setTotal(res.data.total)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [type, sort, page])

  // Filters reset paging — page 4 of a narrower filter is usually empty.
  useEffect(() => { setPage(1) }, [type, sort])

  async function togglePin(id: string) {
    setBusyId(id)
    try {
      await api.post(`/community/articles/${id}/pin`)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function remove(a: ArticleListItem) {
    if (!window.confirm(`Delete "${a.title}"? Its comments go with it.`)) return
    setBusyId(a.id)
    try {
      await api.delete(`/community/articles/${a.id}`)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 20))

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="page-header">
          <h1>Community</h1>
          <button className="btn btn-primary" onClick={() => navigate('/community/new')}>
            + New article
          </button>
        </div>

        <div className="tab-row">
          {TYPE_TABS.map(t => (
            <button
              key={t.value}
              className={`tab-btn ${type === t.value ? 'active' : ''}`}
              onClick={() => setType(t.value)}
            >
              {t.label}
            </button>
          ))}
          <div className="tab-spacer" />
          <select
            className="input mod-sort"
            value={sort}
            onChange={e => setSort(e.target.value as 'new' | 'top')}
          >
            <option value="new">Newest first</option>
            <option value="top">Top rated</option>
          </select>
        </div>

        {loading ? (
          <p className="empty">Loading…</p>
        ) : articles.length === 0 ? (
          <p className="empty">No articles in this category yet.</p>
        ) : (
          <div className="mod-list">
            {articles.map(a => (
              <div key={a.id} className={`card mod-row ${a.pinned ? 'mod-pinned' : ''}`}>
                <div className="mod-row-main">
                  <div className="mod-row-top">
                    {a.pinned && <span className="badge badge-scheduled">📌 Pinned</span>}
                    <span className="badge badge-ended">{TYPE_LABEL[a.type]}</span>
                    <span className={`mod-score ${a.score < 0 ? 'negative' : a.score > 0 ? 'positive' : ''}`}>
                      {a.score > 0 ? `+${a.score}` : a.score}
                    </span>
                    <span className="mod-meta">💬 {a.commentCount}</span>
                  </div>
                  <button className="mod-title" onClick={() => navigate(`/community/${a.id}`)}>
                    {a.title}
                  </button>
                  <p className="mod-excerpt">{a.excerpt}</p>
                  <p className="mod-meta">
                    {a.author.name} · rating {a.author.rating}
                    {a.author.role === 'ADMIN' && <span className="mod-admin-tag">admin</span>}
                    {' · '}{timeAgo(a.createdAt)}
                  </p>
                </div>
                <div className="mod-row-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === a.id}
                    onClick={() => togglePin(a.id)}
                  >
                    {a.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigate(`/community/${a.id}/edit`)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-ghost btn-sm mod-danger"
                    disabled={busyId === a.id}
                    onClick={() => remove(a)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mod-pagination">
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              ← Previous
            </button>
            <span className="mod-meta">Page {page} of {totalPages} · {total} articles</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  )
}
