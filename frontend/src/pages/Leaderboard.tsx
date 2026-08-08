import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import { getTier } from '../lib/tiers'
import { usePageMeta } from '../lib/seo'

interface Entry {
  rank: number
  id: string
  name: string
  rating: number
  ratingChange: number | null
}

const RANK_MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function Leaderboard() {
  usePageMeta('Leaderboard — RankArenas', 'Top-rated SSC aspirants on RankArenas. See the live rankings across mock contests.')
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const me = JSON.parse(localStorage.getItem('user') || '{}')

  useEffect(() => {
    setLoading(true)
    api.get('/ratings/leaderboard')
      .then(r => setEntries(r.data))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <Navbar />
      <div className="page">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
          <h1 style={{ marginBottom: 0 }}>Global Leaderboard</h1>
          <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Top rated players</span>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          ) : entries.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>No rated contests yet.</div>
          ) : (
            <table className="contest-table">
              <thead>
                <tr>
                  <th style={{ width: 56, textAlign: 'center' }}>#</th>
                  <th>Player</th>
                  <th style={{ textAlign: 'right' }}>Rating</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => {
                  const tier = getTier(entry.rating)
                  const isMe = entry.id === me.id
                  return (
                    <tr
                      key={entry.id}
                      style={{ ...(isMe ? { background: '#eff6ff' } : {}), cursor: 'pointer' }}
                      onClick={() => navigate(isMe ? '/profile' : `/profile/${entry.id}`)}
                    >
                      <td style={{ textAlign: 'center' }}>
                        {RANK_MEDAL[entry.rank] ? (
                          <span style={{ fontSize: 18 }}>{RANK_MEDAL[entry.rank]}</span>
                        ) : (
                          <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{entry.rank}</span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: tier.fg }}>{entry.name}</span>
                        {isMe && <span className="lb-you" style={{ marginLeft: 8 }}>you</span>}
                        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, background: tier.bg, color: tier.fg, padding: '1px 8px', borderRadius: 20 }}>
                          {tier.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 16 }}>{entry.rating}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {!loading && entries.length > 0 && (
          <p style={{ textAlign: 'center', marginTop: 14, color: 'var(--text-muted)', fontSize: 13 }}>
            Showing top {entries.length} players
          </p>
        )}
      </div>
    </>
  )
}
