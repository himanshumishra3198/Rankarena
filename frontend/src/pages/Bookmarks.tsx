import { useEffect, useState } from 'react'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import { QuestionContext } from '../components/QuestionContent'
import { RichText } from '../components/RichText'
import { usePageMeta } from '../lib/seo'

interface BQuestion {
  id: string; text: string; imageUrl?: string
  optionA: string; optionB: string; optionC: string; optionD: string
  correctOption: string; subject: string; difficulty: string
  questionType?: 'STANDARD' | 'SYLLOGISM' | 'PASSAGE' | 'TABLE'
  structuredData?: { statements: string[]; conclusions: string[] } | null
  passage?: { id: string; title: string; content: string; type: 'TEXT' | 'TABLE'; tableData?: { headers: string[]; rows: string[][] } | null } | null
  solution?: string | null
}

const SECTION_LABELS: Record<string, string> = {
  QUANT: 'Quantitative Aptitude', REASONING: 'Reasoning', ENGLISH: 'English', GK: 'General Awareness',
}
const SUBJECTS = ['QUANT', 'REASONING', 'ENGLISH', 'GK'] as const

function optText(q: BQuestion, opt: string) {
  return ({ A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD } as any)[opt] ?? ''
}

export default function Bookmarks() {
  usePageMeta('Bookmarks — RankArenas', 'Your saved questions for revision.')
  const [items, setItems] = useState<BQuestion[] | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [solOpen, setSolOpen] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.get('/bookmarks').then(r => setItems(r.data)).catch(() => setItems([]))
  }, [])

  async function remove(qid: string) {
    setItems(list => (list ?? []).filter(q => q.id !== qid))
    try { await api.post(`/bookmarks/${qid}`) } catch { /* refetch on error */ api.get('/bookmarks').then(r => setItems(r.data)) }
  }

  const visible = (items ?? []).filter(q => filter === 'all' || q.subject === filter)

  return (
    <>
      <Navbar />
      <div className="page" style={{ maxWidth: 900 }}>
        <h1 style={{ marginBottom: 6 }}>⭐ Bookmarked Questions</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
          Questions you saved across mocks — revise them anytime.
        </p>

        {items === null && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
        {items && items.length === 0 && (
          <div className="card"><p className="empty">No bookmarks yet. Tap the ☆ on any question in a mock result to save it here.</p></div>
        )}

        {items && items.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              <button className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('all')}>
                All ({items.length})
              </button>
              {SUBJECTS.filter(s => items.some(q => q.subject === s)).map(s => (
                <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(s)}>
                  {SECTION_LABELS[s]} ({items.filter(q => q.subject === s).length})
                </button>
              ))}
            </div>

            <div className="card">
              {visible.map((q, i) => (
                <div key={q.id} className="sol-item">
                  <div className="sol-body" style={{ borderTop: i === 0 ? 'none' : undefined, paddingTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>{SECTION_LABELS[q.subject] ?? q.subject}</span>
                      <button className="bookmark-btn" title="Remove bookmark" onClick={() => remove(q.id)}>⭐</button>
                    </div>
                    <QuestionContext q={q} />
                    {q.imageUrl && (
                      <div style={{ marginBottom: 12 }}>
                        <img src={q.imageUrl} alt="Question" style={{ maxHeight: 220, maxWidth: '100%', borderRadius: 6, border: '1px solid var(--border)' }} />
                      </div>
                    )}
                    {q.text && <RichText as="p" className="review-qtext" html={q.text} />}
                    <div className="options" style={{ marginTop: 10 }}>
                      {(['A', 'B', 'C', 'D'] as const).map(opt => {
                        const isCorrect = opt === q.correctOption
                        return (
                          <div key={opt} className="option" style={{
                            cursor: 'default',
                            borderColor: isCorrect ? '#16a34a' : 'var(--border)',
                            background: isCorrect ? 'rgba(22,163,74,.08)' : 'transparent',
                          }}>
                            <span className="option-label">{opt}</span>
                            <span className="option-text"><RichText html={optText(q, opt)} /></span>
                            {isCorrect && <span style={{ marginLeft: 'auto', color: '#16a34a', fontWeight: 700, fontSize: 13 }}>✓ Correct answer</span>}
                          </div>
                        )
                      })}
                    </div>
                    {q.solution && (
                      <div className="sol-explain">
                        <button className="sol-explain-toggle"
                          onClick={() => setSolOpen(s => { const n = new Set(s); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n })}>
                          <span style={{ fontSize: 16 }}>👁</span> {solOpen.has(q.id) ? 'Hide Solution' : 'View Solution'}
                        </button>
                        {solOpen.has(q.id) && (
                          <div className="sol-explain-body">
                            <div className="sol-explain-title">Solution</div>
                            <RichText as="div" className="sol-explain-text" html={q.solution} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
