import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { timeAgo } from '../lib/time'
import { getTier } from '../lib/tiers'

type NotificationType = 'FOLLOW' | 'ARTICLE_VOTE' | 'COMMENT_VOTE' | 'ANNOUNCEMENT'

interface Notification {
  id: string
  type: NotificationType
  read: boolean
  createdAt: string
  voteValue: number | null
  actor: { id: string; name: string; rating: number } | null
  articleId: string | null
  articleTitle: string | null
  commentPreview: string | null
}

const ICONS: Record<NotificationType, string> = {
  FOLLOW: '👤',
  ARTICLE_VOTE: '📄',
  COMMENT_VOTE: '💬',
  ANNOUNCEMENT: '📣',
}

// How often the badge re-checks while the tab is open. Long enough to be
// cheap, short enough that a notification doesn't feel stale.
const POLL_MS = 60_000

function describe(n: Notification): { text: string; strong?: string } {
  const who = n.actor?.name ?? 'Someone'
  switch (n.type) {
    case 'FOLLOW':
      return { text: 'started following you', strong: who }
    case 'ARTICLE_VOTE':
      return {
        text: `${n.voteValue === -1 ? 'downvoted' : 'upvoted'} your article${n.articleTitle ? ` “${n.articleTitle}”` : ''}`,
        strong: who,
      }
    case 'COMMENT_VOTE':
      return {
        text: `${n.voteValue === -1 ? 'downvoted' : 'upvoted'} your comment${n.commentPreview ? `: “${n.commentPreview}”` : ''}`,
        strong: who,
      }
    case 'ANNOUNCEMENT':
      return { text: n.articleTitle ? `New announcement: “${n.articleTitle}”` : 'New announcement' }
  }
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [items, setItems] = useState<Notification[] | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  async function refreshCount() {
    try {
      const { data } = await api.get('/notifications/unread-count')
      setCount(data.count)
    } catch { /* the badge is not worth surfacing an error for */ }
  }

  useEffect(() => {
    refreshCount()
    const id = setInterval(refreshCount, POLL_MS)
    // Coming back to the tab is the moment a stale badge is most obvious.
    const onFocus = () => refreshCount()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [])

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  async function toggle() {
    const next = !open
    setOpen(next)
    if (!next) return

    setItems(null)
    try {
      const { data } = await api.get('/notifications', { params: { limit: 20 } })
      setItems(data)
      // Opening the panel is the acknowledgement, so the badge clears here.
      if (count > 0) {
        await api.post('/notifications/read-all')
        setCount(0)
      }
    } catch {
      setItems([])
    }
  }

  function go(n: Notification) {
    setOpen(false)
    if (n.type === 'FOLLOW' && n.actor) navigate(`/profile/${n.actor.id}`)
    else if (n.articleId) navigate(`/community/${n.articleId}`)
  }

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        className={`notif-bell ${open ? 'active' : ''}`}
        onClick={toggle}
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        aria-expanded={open}
      >
        🔔
        {count > 0 && <span className="notif-badge">{count > 99 ? '99+' : count}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-head">Notifications</div>

          {items === null ? (
            <div className="notif-empty">Loading…</div>
          ) : items.length === 0 ? (
            <div className="notif-empty">
              <span className="notif-empty-icon">🔔</span>
              <p>Nothing yet.</p>
              <p className="notif-empty-sub">
                Follows, votes on your posts and announcements will show up here.
              </p>
            </div>
          ) : (
            <div className="notif-list">
              {items.map(n => {
                const d = describe(n)
                const tier = n.actor ? getTier(n.actor.rating) : null
                return (
                  <button
                    key={n.id}
                    className={`notif-item ${n.read ? '' : 'unread'}`}
                    onClick={() => go(n)}
                  >
                    <span className="notif-icon" aria-hidden="true">{ICONS[n.type]}</span>
                    <span className="notif-body">
                      <span className="notif-text">
                        {d.strong && (
                          <strong style={tier ? { color: tier.fg } : undefined}>{d.strong} </strong>
                        )}
                        {d.text}
                      </span>
                      <span className="notif-time">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
