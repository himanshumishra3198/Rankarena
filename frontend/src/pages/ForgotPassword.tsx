import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import api from '../lib/api'
import { usePageMeta } from '../lib/seo'

export default function ForgotPassword() {
  usePageMeta('Reset your password — RankArenas', 'Request a password reset link for your RankArenas account.')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
    } catch {
      // Deliberately ignored. The API answers the same way whether or not the
      // address exists, and surfacing a network hiccup differently here would
      // give away which addresses are registered.
    } finally {
      setLoading(false)
      setSent(true)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="auth-title">
          <Logo size={30} />
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Reset your password</p>
        </div>

        {sent ? (
          <>
            <div className="alert alert-success">
              If an account exists for <strong>{email}</strong>, a reset link is on its way.
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 12 }}>
              The link works once and expires in an hour. Check your spam folder if it
              has not arrived in a few minutes.
            </p>
            <p className="auth-footer"><Link to="/login">Back to sign in</Link></p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
              Enter the address you signed up with and we'll email you a link to choose
              a new password.
            </p>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Email</label>
                <input className="input" type="email" value={email} required autoFocus
                  onChange={e => setEmail(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
            <p className="auth-footer">
              Remembered it? <Link to="/login">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
