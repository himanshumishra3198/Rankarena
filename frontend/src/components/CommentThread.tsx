import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import { timeAgo } from '../lib/time'
import { getTier } from '../lib/tiers'
import type { ArticleComment } from '../lib/types'
import Markdown from './Markdown'
import VoteButtons from './VoteButtons'

export interface CommentNode extends ArticleComment {
  children: CommentNode[]
}

// The API returns a flat, oldest-first list; nesting happens here. Any comment
// whose parent is missing (parent hard-deleted, or a partial page) is promoted
// to the top level so it can never vanish from the thread.
export function buildTree(comments: ArticleComment[]): CommentNode[] {
  const byId = new Map<string, CommentNode>()
  comments.forEach(c => byId.set(c.id, { ...c, children: [] }))

  const roots: CommentNode[] = []
  byId.forEach(node => {
    const parent = node.parentId ? byId.get(node.parentId) : null
    if (parent) parent.children.push(node)
    else roots.push(node)
  })
  return roots
}

// Past this depth replies stop indenting, so deep threads don't squeeze into a
// column a few characters wide on a phone.
const MAX_INDENT = 5

function CommentRow({
  node,
  depth,
  currentUserId,
  onReply,
  onChanged,
}: {
  node: CommentNode
  depth: number
  currentUserId: string
  onReply: (parentId: string, body: string) => Promise<void>
  onChanged: () => void
}) {
  const [replying, setReplying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [editDraft, setEditDraft] = useState(node.body)
  const [busy, setBusy] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [error, setError] = useState('')

  const tier = node.author ? getTier(node.author.rating) : null

  async function submitReply() {
    if (!draft.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await onReply(node.id, draft.trim())
      setDraft('')
      setReplying(false)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not post reply')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    if (!editDraft.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await api.patch(`/community/comments/${node.id}`, { body: editDraft.trim() })
      setEditing(false)
      onChanged()
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm('Delete this comment? Replies to it will stay.')) return
    setBusy(true)
    try {
      await api.delete(`/community/comments/${node.id}`)
      onChanged()
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not delete')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`comment ${depth > 0 ? 'comment-reply' : ''}`}>
      <div className="comment-main">
        {!node.deleted && (
          <VoteButtons
            kind="comments"
            id={node.id}
            score={node.score}
            myVote={node.myVote}
            disabled={node.author?.id === currentUserId}
          />
        )}

        <div className="comment-body-col">
          <div className="comment-meta">
            {node.deleted ? (
              <span className="comment-deleted-label">[deleted]</span>
            ) : (
              <>
                <Link
                  to={`/profile/${node.author!.id}`}
                  className="comment-author"
                  style={{ color: tier!.fg }}
                >
                  {node.author!.name}
                </Link>
                <span className="comment-dot">·</span>
                <span className="comment-time">{timeAgo(node.createdAt)}</span>
                {node.updatedAt !== node.createdAt && (
                  <span className="comment-edited">(edited)</span>
                )}
              </>
            )}
            {node.children.length > 0 && (
              <button className="comment-collapse" onClick={() => setCollapsed(c => !c)}>
                {collapsed ? `[+] ${node.children.length} repl${node.children.length > 1 ? 'ies' : 'y'}` : '[−]'}
              </button>
            )}
          </div>

          {node.deleted ? (
            <p className="comment-deleted-body">This comment was deleted.</p>
          ) : editing ? (
            <div className="comment-editor">
              <textarea
                className="input comment-textarea"
                value={editDraft}
                onChange={e => setEditDraft(e.target.value)}
                rows={4}
              />
              <div className="comment-actions">
                <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={busy}>
                  Save
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setEditDraft(node.body) }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <Markdown source={node.body} className="comment-text" />
          )}

          {error && <p className="comment-error">{error}</p>}

          {!node.deleted && !editing && (
            <div className="comment-actions">
              <button className="comment-action" onClick={() => setReplying(r => !r)}>
                {replying ? 'Cancel' : 'Reply'}
              </button>
              {node.canModify && (
                <>
                  <button className="comment-action" onClick={() => setEditing(true)}>Edit</button>
                  <button className="comment-action comment-action-danger" onClick={remove} disabled={busy}>
                    Delete
                  </button>
                </>
              )}
            </div>
          )}

          {replying && (
            <div className="comment-editor">
              <textarea
                className="input comment-textarea"
                placeholder="Write a reply… (Markdown supported)"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={3}
                autoFocus
              />
              <div className="comment-actions">
                <button className="btn btn-primary btn-sm" onClick={submitReply} disabled={busy || !draft.trim()}>
                  {busy ? 'Posting…' : 'Post reply'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {!collapsed && node.children.length > 0 && (
        <div className={`comment-children ${depth >= MAX_INDENT ? 'comment-children-flat' : ''}`}>
          {node.children.map(child => (
            <CommentRow
              key={child.id}
              node={child}
              depth={depth + 1}
              currentUserId={currentUserId}
              onReply={onReply}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function CommentThread({
  comments,
  currentUserId,
  onReply,
  onChanged,
}: {
  comments: ArticleComment[]
  currentUserId: string
  onReply: (parentId: string | null, body: string) => Promise<void>
  onChanged: () => void
}) {
  const tree = buildTree(comments)
  if (tree.length === 0) {
    return <p className="comment-empty">No comments yet. Start the discussion.</p>
  }
  return (
    <div className="comment-thread">
      {tree.map(node => (
        <CommentRow
          key={node.id}
          node={node}
          depth={0}
          currentUserId={currentUserId}
          onReply={onReply}
          onChanged={onChanged}
        />
      ))}
    </div>
  )
}
