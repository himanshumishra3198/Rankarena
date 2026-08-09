import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

/**
 * In-app replacement for window.confirm and window.alert.
 *
 * The native dialogs are jarring — they render in the browser's chrome rather
 * than the page, are styled by the OS, ignore dark mode, and in an exam room
 * they look like a browser error rather than part of the test. They also block
 * the main thread, which stalls the contest timer.
 *
 * Exposed as a promise so a call site reads almost exactly as it did before:
 *
 *   if (!(await confirm({ title: '…', message: '…' }))) return
 */
export interface ConfirmOptions {
  title: string
  message?: string
  /** Extra emphasis line, e.g. a count of unanswered questions. */
  detail?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button, for destructive actions. */
  danger?: boolean
  /** Drops the cancel button — the equivalent of alert(). */
  acknowledgeOnly?: boolean
}

type Resolver = (ok: boolean) => void

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<Resolver | null>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o)
    return new Promise<boolean>(resolve => { resolverRef.current = resolve })
  }, [])

  const close = useCallback((ok: boolean) => {
    resolverRef.current?.(ok)
    resolverRef.current = null
    setOpts(null)
  }, [])

  // Enter confirms, Escape cancels — the same keys the native dialog answered
  // to, so muscle memory carries over.
  useEffect(() => {
    if (!opts) return
    confirmBtnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !opts.acknowledgeOnly) { e.preventDefault(); close(false) }
      if (e.key === 'Enter') { e.preventDefault(); close(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [opts, close])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="modal-overlay confirm-overlay"
          // Clicking away cancels, but never on an acknowledgement, where
          // there is nothing to cancel.
          onMouseDown={e => { if (e.target === e.currentTarget && !opts.acknowledgeOnly) close(false) }}
        >
          <div className="modal-box confirm-box" role="alertdialog" aria-modal="true"
            aria-labelledby="confirm-title">
            <h3 id="confirm-title" className="confirm-title">{opts.title}</h3>
            {opts.message && <p className="confirm-message">{opts.message}</p>}
            {opts.detail && <p className="confirm-detail">{opts.detail}</p>}
            <div className="confirm-actions">
              {!opts.acknowledgeOnly && (
                <button className="btn btn-ghost" onClick={() => close(false)}>
                  {opts.cancelLabel ?? 'Cancel'}
                </button>
              )}
              <button
                ref={confirmBtnRef}
                className={`btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close(true)}
              >
                {opts.confirmLabel ?? (opts.acknowledgeOnly ? 'OK' : 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

/** Promise-based confirm. Resolves true when the action is confirmed. */
export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return ctx
}

/** One-button notice — the replacement for alert(). */
export function useNotify() {
  const confirm = useConfirm()
  return useCallback(
    (title: string, message?: string) =>
      confirm({ title, message, acknowledgeOnly: true }),
    [confirm]
  )
}
