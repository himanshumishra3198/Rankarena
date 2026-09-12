import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../lib/api'
import Logo from '../components/Logo'

/**
 * Landing page for the unsubscribe link in contest email.
 *
 * Acts on load rather than asking for a confirming click. Someone who has
 * followed an unsubscribe link has already decided, and a page that makes them
 * press a second button is the kind of thing that gets mail marked as spam
 * instead. The way back is offered right underneath, which costs nothing.
 */
export default function Unsubscribe() {
  const [params] = useSearchParams()
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  const userId = params.get('u') ?? ''
  const token = params.get('t') ?? ''

  useEffect(() => {
    if (!userId || !token) { setState('failed'); setError('This link is incomplete.'); return }
    api.post('/profile/unsubscribe', { userId, token })
      .then(r => { setEmail(r.data.email ?? ''); setState('done') })
      .catch(e => {
        setError(e?.response?.data?.error || 'We could not process that link.')
        setState('failed')
      })
  }, [userId, token])

  return (
    <div className="page" style={{ maxWidth: 520, textAlign: 'center', paddingTop: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}><Logo /></div>

      {state === 'working' && <p style={{ color: 'var(--text-muted)' }}>Updating your preferences…</p>}

      {state === 'done' && (
        <div className="card">
          <div style={{ fontSize: 34, marginBottom: 10 }} aria-hidden="true">✓</div>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>You're unsubscribed</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7 }}>
            {email ? <><strong>{email}</strong> will no longer get</> : 'You will no longer get'}{' '}
            contest announcements or start reminders.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.7, marginTop: 14 }}>
            Account email — password resets, address confirmation — still goes out, because
            those are about your account rather than about contests.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
            <Link to="/contests" className="btn btn-primary">Back to contests</Link>
            <Link to="/profile" className="btn btn-ghost">Turn them back on</Link>
          </div>
        </div>
      )}

      {state === 'failed' && (
        <div className="card">
          <div style={{ fontSize: 34, marginBottom: 10 }} aria-hidden="true">⚠️</div>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>That link did not work</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7 }}>{error}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.7, marginTop: 12 }}>
            You can switch contest email off yourself from your profile.
          </p>
          <Link to="/profile" className="btn btn-primary" style={{ marginTop: 18 }}>Open my profile</Link>
        </div>
      )}
    </div>
  )
}
