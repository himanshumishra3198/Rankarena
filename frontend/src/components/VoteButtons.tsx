import { useState } from 'react'
import api from '../lib/api'

// Codeforces-style up/down control. Optimistically updates so the arrow
// responds instantly, then reconciles with the server's authoritative score
// (and rolls back if the request is rejected, e.g. voting on your own post).
export default function VoteButtons({
  kind,
  id,
  score,
  myVote,
  disabled,
  layout = 'column',
  onChange,
}: {
  kind: 'articles' | 'comments'
  id: string
  score: number
  myVote: number
  disabled?: boolean
  layout?: 'column' | 'row'
  onChange?: (score: number, myVote: number) => void
}) {
  const [state, setState] = useState({ score, myVote })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Drives a one-shot bump animation so a registered vote is felt, not just seen.
  const [pulse, setPulse] = useState(0)

  async function vote(value: 1 | -1) {
    if (busy || disabled) return
    const previous = state
    // Pressing the active arrow clears the vote.
    const next = previous.myVote === value ? 0 : value
    const optimistic = { score: previous.score - previous.myVote + next, myVote: next }

    setState(optimistic)
    setPulse(p => p + 1)
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post(`/community/${kind}/${id}/vote`, { value })
      setState({ score: data.score, myVote: data.myVote })
      onChange?.(data.score, data.myVote)
    } catch (e: any) {
      setState(previous)
      setError(e?.response?.data?.error || 'Could not vote')
    } finally {
      setBusy(false)
    }
  }

  const scoreClass = state.score > 0 ? 'positive' : state.score < 0 ? 'negative' : ''
  const title = error || (disabled ? "You can't vote on your own post" : undefined)

  return (
    <div className={`vote-box vote-${layout} ${error ? 'vote-error' : ''}`} title={title}>
      <button
        className={`vote-btn ${state.myVote === 1 ? 'active-up' : ''}`}
        onClick={() => vote(1)}
        disabled={disabled || busy}
        aria-label={state.myVote === 1 ? 'Remove upvote' : 'Upvote'}
        aria-pressed={state.myVote === 1}
      >
        <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
          <path d="M10 3.5 18 14H2z" />
        </svg>
      </button>
      <span key={pulse} className={`vote-score ${scoreClass} ${pulse ? 'bump' : ''}`}>
        {state.score > 0 ? `+${state.score}` : state.score}
      </span>
      <button
        className={`vote-btn ${state.myVote === -1 ? 'active-down' : ''}`}
        onClick={() => vote(-1)}
        disabled={disabled || busy}
        aria-label={state.myVote === -1 ? 'Remove downvote' : 'Downvote'}
        aria-pressed={state.myVote === -1}
      >
        <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
          <path d="M10 16.5 2 6h16z" />
        </svg>
      </button>
    </div>
  )
}
