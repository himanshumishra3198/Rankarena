import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Logo from '../components/Logo'
import api from '../lib/api'
import { usePageMeta } from '../lib/seo'

export default function ResetPassword() {
  usePageMeta('Choose a new password — RankArenas', 'Set a new password for your RankArenas account.')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('The two passwords do not match.'); return }

    setLoading(true)
    try {
      const res = await api.post('/auth/reset-password', { token, password })
      // The API returns a session, so a reset lands them signed in rather than
      // on a login form typing the password they just chose.
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      window.location.href = '/'
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not reset the password.')
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card">
          <div className="auth-title"><Logo size={30} /></div>
          <div className="alert alert-error">This reset link is incomplete.</div>
          <p className="auth-footer"><Link to="/forgot-password">Request a new one</Link></p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="auth-title">
          <Logo size={30} />
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Choose a new password</p>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>New password</label>
            <input className="input" type="password" value={password} required autoFocus
              minLength={6} onChange={e => setPassword(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Confirm new password</label>
            <input className="input" type="password" value={confirm} required
              minLength={6} onChange={e => setConfirm(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Set password and sign in'}
          </button>
        </form>
        <p className="auth-footer">
          <button className="linklike" onClick={() => navigate('/login')}>Back to sign in</button>
        </p>
      </div>
    </div>
  )
}
