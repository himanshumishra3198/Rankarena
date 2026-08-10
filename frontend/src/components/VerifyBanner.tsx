import { useEffect, useState } from 'react'
import api from '../lib/api'

/**
 * Shown to signed-in users who have not confirmed their address yet.
 *
 * It re-checks with the API on mount rather than trusting the stored user:
 * someone who verifies in the tab the email opened would otherwise keep seeing
 * this in their original tab until they signed out and back in.
 */
export default function VerifyBanner() {
  const [show, setShow] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!localStorage.getItem('token')) return
    let cancelled = false
    api.get('/auth/me')
      .then(res => {
        if (cancelled) return
        // Keep storage in step, so the rest of the app agrees with the banner.
        localStorage.setItem('user', JSON.stringify(res.data.user))
        setShow(!res.data.user.emailVerified)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  async function resend() {
    setState('sending')
    try {
      const res = await api.post('/auth/resend-verification')
      if (res.data.alreadyVerified) { setShow(false); return }
      setState('sent')
    } catch (e: any) {
      setMessage(e?.response?.data?.error || 'Could not send the email. Try again shortly.')
      setState('failed')
    }
  }

  if (!show) return null

  return (
    <div className="verify-banner">
      <span aria-hidden="true">✉️</span>
      <div className="verify-banner-text">
        {state === 'sent' ? (
          <><strong>Link sent.</strong> Check your inbox — and your spam folder.</>
        ) : (
          <>
            <strong>Confirm your email to enter contests.</strong> You can look around
            until then, but joining a contest or mock test needs a confirmed address.
          </>
        )}
        {state === 'failed' && <div className="verify-banner-error">{message}</div>}
      </div>
      {state !== 'sent' && (
        <button className="btn btn-sm verify-banner-btn" onClick={resend} disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Resend email'}
        </button>
      )}
    </div>
  )
}
