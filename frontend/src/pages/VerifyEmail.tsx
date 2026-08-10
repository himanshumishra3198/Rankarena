import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Logo from '../components/Logo'
import api from '../lib/api'
import { usePageMeta } from '../lib/seo'

/**
 * Landing page for the link in the confirmation email.
 *
 * The token is single-use, so this must fire exactly once — React 19's strict
 * mode mounts effects twice in development, and a second call would burn the
 * token and show "already used" to someone who just clicked a fresh link.
 */
export default function VerifyEmail() {
  usePageMeta('Confirm your email — RankArenas', 'Confirm your email address to unlock contests on RankArenas.')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = useState<'working' | 'done' | 'failed'>(token ? 'working' : 'failed')
  const [error, setError] = useState(token ? '' : 'This confirmation link is incomplete.')
  const fired = useRef(false)

  useEffect(() => {
    if (!token || fired.current) return
    fired.current = true
    api.post('/auth/verify-email', { token })
      .then(res => {
        localStorage.setItem('token', res.data.token)
        localStorage.setItem('user', JSON.stringify(res.data.user))
        setState('done')
      })
      .catch(err => {
        setError(err?.response?.data?.error || 'That link is not valid.')
        setState('failed')
      })
  }, [token])

  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ textAlign: 'center' }}>
        <div className="auth-title" style={{ justifyContent: 'center' }}><Logo size={30} /></div>

        {state === 'working' && (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Confirming your email…</p>
        )}

        {state === 'done' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <h2 style={{ fontSize: 18 }}>Email confirmed</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, margin: '8px 0 20px' }}>
              You're signed in and contests are unlocked.
            </p>
            {/* A hard load, so every page picks the new user out of storage. */}
            <a className="btn btn-primary btn-full" href="/">Go to RankArenas</a>
          </>
        )}

        {state === 'failed' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
            <h2 style={{ fontSize: 18 }}>Could not confirm</h2>
            <div className="alert alert-error" style={{ textAlign: 'left', marginTop: 12 }}>{error}</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6, marginTop: 12 }}>
              Sign in and use the banner at the top of the page to send yourself a fresh link.
            </p>
            <p className="auth-footer"><Link to="/login">Go to sign in</Link></p>
          </>
        )}
      </div>
    </div>
  )
}
