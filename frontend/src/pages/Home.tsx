import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import api from '../lib/api'
import { timeAgo } from '../lib/time'
import { getTier } from '../lib/tiers'
import { usePageMeta } from '../lib/seo'
import type { ArticleListItem, Contest } from '../lib/types'
import { TYPE_ICON, TYPE_LABEL } from './Community'

interface Contributor { rank: number; id: string; name: string; rating: number; contribution: number }
interface RankedUser { rank: number; id: string; name: string; rating: number }
interface RecentResult { contestId: string; contestTitle: string; date: string; newRating: number; oldRating: number; rank: number; totalParticipants: number }
interface PublicStats { aspirants: number; mockTests: number; questions: number; contests: number; testsTaken: number }

function phaseOf(c: Contest): 'scheduled' | 'live' | 'ended' {
  const now = Date.now()
  const start = new Date(c.startTime).getTime()
  const end = start + c.durationMinutes * 60_000
  if (now >= end) return 'ended'
  if (now >= start) return 'live'
  return 'scheduled'
}

// Codeforces-style countdown: days only appear once there are any.
function countdown(ms: number): string {
  if (ms <= 0) return '00:00:00'
  const total = Math.floor(ms / 1000)
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`
}

export default function Home() {
  usePageMeta(
    'RankArena — SSC contests, mock tests and community',
    'Live rated contests, free mock tests and an active community for SSC CGL, CHSL, MTS, CPO and GD aspirants.'
  )
  const navigate = useNavigate()
  const signedIn = Boolean(localStorage.getItem('token'))
  const user = JSON.parse(localStorage.getItem('user') || '{}')

  const [articles, setArticles] = useState<ArticleListItem[] | null>(null)
  const [contests, setContests] = useState<Contest[]>([])
  const [topRated, setTopRated] = useState<RankedUser[]>([])
  const [contributors, setContributors] = useState<Contributor[]>([])
  const [stats, setStats] = useState<PublicStats | null>(null)
  const [results, setResults] = useState<RecentResult[]>([])
  const [rating, setRating] = useState<number>(user.rating ?? 1500)
  const [now, setNow] = useState(Date.now())
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    // Everything here is public; the profile call is the only signed-in extra.
    api.get('/community/articles', { params: { sort: 'new' } })
      .then(r => setArticles(r.data.articles.slice(0, 8)))
      .catch(() => setArticles([]))
    api.get('/contests')
      .then(r => setContests([...(r.data.active ?? []), ...(r.data.past ?? [])]))
      .catch(() => {})
    api.get('/ratings/leaderboard').then(r => setTopRated(r.data.slice(0, 5))).catch(() => {})
    api.get('/community/contributors').then(r => setContributors(r.data)).catch(() => {})

    if (signedIn) {
      api.get('/profile')
        .then(r => {
          setRating(r.data.user?.rating ?? 1500)
          setResults((r.data.ratingHistory ?? []).slice(-3).reverse())
        })
        .catch(() => {})
    } else {
      api.get('/stats/public').then(r => setStats(r.data)).catch(() => {})
    }
  }, [signedIn])

  // One ticking clock drives every countdown on the page.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  async function enterContest(c: Contest) {
    if (!signedIn) { navigate('/login'); return }
    setJoining(true)
    try {
      if (!c.hasJoined) await api.post(`/contests/${c.id}/join`)
      navigate(`/contests/${c.id}`)
    } finally {
      setJoining(false)
    }
  }

  const live = contests.filter(c => phaseOf(c) === 'live')
  const upcoming = contests
    .filter(c => phaseOf(c) === 'scheduled')
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))
  // "Pay attention" shows whatever is most urgent: a running contest first,
  // otherwise the next scheduled one.
  const attention = live[0] ?? upcoming[0] ?? null
  const tier = getTier(rating)

  return (
    <>
      <Navbar />
      <div className="page-wide home-page">
        <div className="home-layout">
          {/* ------------------------------ feed ------------------------------ */}
          <div className="home-main">
            {!signedIn && (
              <div className="guest-intro">
                <h1 className="guest-intro-title">Practice like it's exam day.</h1>
                <p className="guest-intro-sub">
                  Rated contests, free mock tests and a community of SSC aspirants —
                  CGL, CHSL, MTS, CPO and GD.
                </p>
                {stats && (
                  <div className="guest-stats">
                    <span><strong>{stats.aspirants.toLocaleString('en-IN')}</strong> aspirants</span>
                    <span><strong>{stats.questions.toLocaleString('en-IN')}</strong> questions</span>
                    <span><strong>{stats.testsTaken.toLocaleString('en-IN')}</strong> tests taken</span>
                  </div>
                )}
                <div className="guest-intro-actions">
                  <button className="btn btn-primary" onClick={() => navigate('/register')}>
                    Create free account
                  </button>
                  <button className="btn btn-ghost" onClick={() => navigate('/login')}>Log in</button>
                </div>
              </div>
            )}

            <div className="feed-head">
              <h2 className="feed-title">Recent posts</h2>
              <Link to="/community" className="feed-more">Browse community →</Link>
            </div>

            {articles === null ? (
              <div className="feed-list">
                {[0, 1, 2].map(i => (
                  <div key={i} className="feed-entry article-skeleton" aria-hidden="true">
                    <div className="skeleton-line skeleton-pill" />
                    <div className="skeleton-line skeleton-title" />
                    <div className="skeleton-line" />
                    <div className="skeleton-line skeleton-short" />
                  </div>
                ))}
              </div>
            ) : articles.length === 0 ? (
              <div className="card community-notice">
                <span className="community-empty-icon">✍️</span>
                <p className="community-empty-title">No posts yet</p>
                <p className="community-empty-sub">
                  Announcements, editorials and tips from the community will show up here.
                </p>
                {signedIn && (
                  <button className="btn btn-primary btn-sm" onClick={() => navigate('/community/new')}>
                    Write the first one
                  </button>
                )}
              </div>
            ) : (
              <div className="feed-list">
                {articles.map(a => {
                  const t = getTier(a.author.rating)
                  return (
                    <article key={a.id} className={`feed-entry cat-${a.type.toLowerCase()}`}>
                      <div className="feed-entry-top">
                        {a.pinned && <span className="article-pin">📌 Pinned</span>}
                        <span className="article-type">
                          {TYPE_ICON[a.type]} {TYPE_LABEL[a.type]}
                        </span>
                      </div>
                      <Link to={`/community/${a.id}`} className="feed-entry-title">{a.title}</Link>
                      <p className="feed-entry-byline">
                        By{' '}
                        <Link to={`/profile/${a.author.id}`} style={{ color: t.fg }} className="article-author">
                          {a.author.name}
                        </Link>
                        , {timeAgo(a.createdAt)}
                      </p>
                      <p className="feed-entry-excerpt">{a.excerpt}</p>
                      <div className="feed-entry-foot">
                        <span className={`feed-score ${a.score > 0 ? 'positive' : a.score < 0 ? 'negative' : ''}`}>
                          {a.score > 0 ? `+${a.score}` : a.score}
                        </span>
                        <span className="comment-dot">·</span>
                        <span>{a.readingMinutes} min read</span>
                        <Link to={`/community/${a.id}`} className="feed-comments">
                          💬 {a.commentCount === 0
                            ? 'Comment'
                            : `${a.commentCount} ${a.commentCount === 1 ? 'comment' : 'comments'}`}
                        </Link>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          {/* ---------------------------- sidebar ----------------------------- */}
          <aside className="home-sidebar">
            {attention && (
              <div className="side-card side-attention">
                <div className="side-card-head">→ Pay attention</div>
                <div className="side-card-body">
                  <p className="attention-label">
                    {phaseOf(attention) === 'live' ? 'Running now' : 'Before contest'}
                  </p>
                  <Link to="/contests" className="attention-title">{attention.title}</Link>
                  <p className="attention-clock">
                    {phaseOf(attention) === 'live'
                      ? countdown(new Date(attention.startTime).getTime() + attention.durationMinutes * 60_000 - now)
                      : countdown(new Date(attention.startTime).getTime() - now)}
                  </p>
                  {phaseOf(attention) === 'live' ? (
                    <button className="btn btn-danger btn-sm btn-full" disabled={joining} onClick={() => enterContest(attention)}>
                      {attention.hasSubmitted ? 'View result' : 'Enter contest'}
                    </button>
                  ) : attention.hasJoined ? (
                    <span className="attention-registered">✓ Registered</span>
                  ) : (
                    <button className="btn btn-primary btn-sm btn-full" onClick={() => enterContest(attention)}>
                      {signedIn ? 'Register now »' : 'Sign up to register »'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {signedIn && (
              <div className="side-card">
                <div className="side-card-head">→ Your rating</div>
                <div className="side-card-body rating-block">
                  <span className="rating-block-tier" style={{ color: tier.fg }}>{tier.label}</span>
                  <span className="rating-block-value" style={{ color: tier.fg }}>{rating}</span>
                  <Link to="/profile" className="side-link">View full profile →</Link>
                </div>
              </div>
            )}

            <div className="side-card">
              <div className="side-card-head">→ Top rated</div>
              {topRated.length === 0 ? (
                <div className="side-card-body side-empty">No ratings yet</div>
              ) : (
                <table className="side-table">
                  <thead><tr><th>#</th><th>User</th><th>Rating</th></tr></thead>
                  <tbody>
                    {topRated.map(u => {
                      const t = getTier(u.rating)
                      return (
                        <tr key={u.id} className={u.id === user.id ? 'side-row-me' : ''}>
                          <td>{u.rank}</td>
                          <td>
                            <Link to={u.id === user.id ? '/profile' : `/profile/${u.id}`} style={{ color: t.fg }} className="side-user">
                              {u.name}
                            </Link>
                          </td>
                          <td className="side-num">{u.rating}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              <div className="side-card-foot"><Link to="/leaderboard" className="side-link">View all →</Link></div>
            </div>

            <div className="side-card">
              <div className="side-card-head">→ Top contributors</div>
              {contributors.length === 0 ? (
                <div className="side-card-body side-empty">No contributions yet</div>
              ) : (
                <table className="side-table">
                  <thead><tr><th>#</th><th>User</th><th>Contrib.</th></tr></thead>
                  <tbody>
                    {contributors.map(c => {
                      const t = getTier(c.rating)
                      return (
                        <tr key={c.id} className={c.id === user.id ? 'side-row-me' : ''}>
                          <td>{c.rank}</td>
                          <td>
                            <Link to={c.id === user.id ? '/profile' : `/profile/${c.id}`} style={{ color: t.fg }} className="side-user">
                              {c.name}
                            </Link>
                          </td>
                          <td className="side-num">+{c.contribution}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {signedIn && results.length > 0 && (
              <div className="side-card">
                <div className="side-card-head">→ Your recent contests</div>
                <div className="side-card-body side-results">
                  {results.map(r => {
                    const delta = r.newRating - r.oldRating
                    return (
                      <Link key={r.contestId} to={`/contests/${r.contestId}/result`} className="side-result">
                        <span className="side-result-title">{r.contestTitle}</span>
                        <span className={`side-result-delta ${delta >= 0 ? 'pos' : 'neg'}`}>
                          {delta >= 0 ? '+' : ''}{delta}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
      <Footer />
    </>
  )
}
