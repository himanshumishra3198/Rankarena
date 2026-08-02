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

  async function vote(value: 1 | -1) {
    if (busy || disabled) return
    const previous = state
    // Pressing the active arrow clears the vote.
    const next = previous.myVote === value ? 0 : value
    const optimistic = { score: previous.score - previous.myVote + next, myVote: next }

    setState(optimistic)
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

  return (
    <div className={`vote-box vote-${layout}`} title={error || undefined}>
      <button
        className={`vote-btn ${state.myVote === 1 ? 'active-up' : ''}`}
        onClick={() => vote(1)}
        disabled={disabled || busy}
        aria-label="Upvote"
        aria-pressed={state.myVote === 1}
      >
        ▲
      </button>
      <span className={`vote-score ${scoreClass}`}>
        {state.score > 0 ? `+${state.score}` : state.score}
      </span>
      <button
        className={`vote-btn ${state.myVote === -1 ? 'active-down' : ''}`}
        onClick={() => vote(-1)}
        disabled={disabled || busy}
        aria-label="Downvote"
        aria-pressed={state.myVote === -1}
      >
        ▼
      </button>
    </div>
  )
}
