import { useEffect, useRef, useState } from 'react'
import api from '../lib/api'

/**
 * "Continue with Google", rendered by Google Identity Services.
 *
 * GIS hands the browser a signed ID token; we post that to the API, which
 * verifies the signature and audience against Google before trusting a word of
 * it. Nothing here decides who the user is.
 *
 * Renders nothing at all when VITE_GOOGLE_CLIENT_ID is unset — that is every
 * local checkout, and a dead button is worse than no button.
 */

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: Record<string, unknown>) => void
          renderButton: (el: HTMLElement, o: Record<string, unknown>) => void
        }
      }
    }
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const SRC = 'https://accounts.google.com/gsi/client'

let scriptPromise: Promise<void> | null = null
function loadGis(): Promise<void> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve()
    const el = document.createElement('script')
    el.src = SRC
    el.async = true
    el.defer = true
    el.onload = () => resolve()
    el.onerror = () => reject(new Error('Could not load Google sign-in'))
    document.head.appendChild(el)
  })
  return scriptPromise
}

export default function GoogleButton({
  onError,
  text = 'continue_with',
}: {
  onError: (message: string) => void
  /** GIS label: signin_with | signup_with | continue_with */
  text?: string
}) {
  const holder = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  // A ref, because GIS keeps the callback it was initialised with; a stale
  // closure here would post to the API after the component moved on.
  const errRef = useRef(onError)
  errRef.current = onError

  useEffect(() => {
    if (!CLIENT_ID) return
    let cancelled = false
    let ro: ResizeObserver | null = null

    loadGis()
      .then(() => {
        if (cancelled || !holder.current || !window.google) return
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async (resp: { credential?: string }) => {
            if (!resp.credential) {
              errRef.current('Google did not return a credential.')
              return
            }
            try {
              const res = await api.post('/auth/google', { credential: resp.credential })
              localStorage.setItem('token', res.data.token)
              localStorage.setItem('user', JSON.stringify(res.data.user))
              // A full load rather than navigate(): the navbar and every page
              // read the user out of localStorage once, on mount.
              window.location.href = '/'
            } catch (e: any) {
              errRef.current(e?.response?.data?.error || 'Google sign-in failed.')
            }
          },
        })
        // GIS renders at a fixed pixel width and ignores its container, so a
        // hardcoded value overflows the card on a narrow phone. Measure
        // instead, and clamp to the range GIS accepts.
        const draw = () => {
          if (!holder.current || !window.google) return
          const w = Math.round(holder.current.getBoundingClientRect().width)
          if (!w) return
          holder.current.innerHTML = ''
          window.google.accounts.id.renderButton(holder.current, {
            theme: 'outline',
            size: 'large',
            width: Math.max(200, Math.min(400, w)),
            text,
            shape: 'rectangular',
            logo_alignment: 'center',
          })
        }
        draw()
        setReady(true)

        // Rotating the phone changes the card width; without this the button
        // keeps whatever size it had at first paint. Only redraw on a real
        // change — GIS tears down and rebuilds an iframe each time.
        let last = Math.round(holder.current.getBoundingClientRect().width)
        ro = new ResizeObserver(() => {
          if (!holder.current) return
          const w = Math.round(holder.current.getBoundingClientRect().width)
          if (Math.abs(w - last) > 8) { last = w; draw() }
        })
        ro.observe(holder.current)
      })
      .catch(() => errRef.current('Could not reach Google sign-in.'))

    return () => { cancelled = true; ro?.disconnect() }
  }, [text])

  if (!CLIENT_ID) return null

  return (
    <div className="google-btn-wrap">
      <div ref={holder} className="google-btn" />
      {!ready && <div className="google-btn-skeleton">Loading Google sign-in…</div>}
      <div className="auth-divider"><span>or</span></div>
    </div>
  )
}
