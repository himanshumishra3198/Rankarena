import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Navbar from '../components/Navbar'
import type { MockTestListItem } from '../lib/types'

const SECTIONS = ['QUANT', 'REASONING', 'ENGLISH', 'GK'] as const

const SECTION_LABELS: Record<string, string> = {
  QUANT: 'Quantitative Aptitude',
  REASONING: 'General Intelligence & Reasoning',
  ENGLISH: 'English Language',
  GK: 'General Awareness',
}
const SECTION_SHORT: Record<string, string> = {
  QUANT: 'Quant', REASONING: 'Reasoning', ENGLISH: 'English', GK: 'GK',
}
const SECTION_COLORS: Record<string, string> = {
  QUANT: '#7c3aed', REASONING: '#0ea5e9', ENGLISH: '#16a34a', GK: '#f59e0b',
}

// ── Icons ─────────────────────────────────────────────────────────────────────
// Inline SVG rather than emoji: emoji render at different sizes and weights per
// platform, which made the meta row look uneven.

function IconStack() {
  return (
    <svg className="mock-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5 14.5 5 8 8.5 1.5 5 8 1.5Z" />
      <path d="M2.6 7.6 8 10.5l5.4-2.9M2.6 10.4 8 13.3l5.4-2.9" />
    </svg>
  )
}
function IconTarget() {
  return (
    <svg className="mock-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" /><circle cx="8" cy="8" r="3.2" /><circle cx="8" cy="8" r="0.4" />
    </svg>
  )
}
function IconClock() {
  return (
    <svg className="mock-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" /><path d="M8 4.4V8l2.4 1.6" />
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scorePct(score: number, total: number): number {
  if (total <= 0) return 0
  // Negative marking can push a score below zero; clamp so the bar stays sane.
  return Math.max(0, Math.min(100, (score / total) * 100))
}

/** Colour the score by how it went, so a 0/50 never reads as a green pass. */
function scoreTone(pct: number): string {
  if (pct >= 70) return 'good'
  if (pct >= 40) return 'mid'
  return 'low'
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// ── Card ──────────────────────────────────────────────────────────────────────

function MockCard({ m, onStart, onViewResult }: {
  m: MockTestListItem; onStart: () => void; onViewResult: () => void
}) {
  const totalMarks = m.questionCount * 2
  const hasScore = m.attempted && m.lastScore !== null && m.lastTotal !== null
  const pct = hasScore ? scorePct(m.lastScore!, m.lastTotal!) : 0
  const tone = scoreTone(pct)
  const color = SECTION_COLORS[m.subject]

  return (
    <article className="mock-card" style={{ ['--subject' as string]: color }}>
      <div className="mock-card-head">
        <span className="mock-card-subject">{SECTION_SHORT[m.subject] ?? m.subject}</span>
        {m.attempted && <span className="mock-card-flag">Attempted</span>}
      </div>

      <h3 className="mock-card-title">{m.title}</h3>

      <div className="mock-card-meta">
        <span className="mock-meta-item"><IconStack /> {m.questionCount} questions</span>
        <span className="mock-meta-item"><IconTarget /> {totalMarks} marks</span>
        <span className="mock-meta-item"><IconClock /> {m.durationMinutes} min</span>
      </div>

      {hasScore ? (
        <div className="mock-score">
          <div className="mock-score-row">
            <span className="mock-score-label">Last attempt</span>
            <span className={`mock-score-val tone-${tone}`}>
              {trimNum(m.lastScore!)}<span className="mock-score-total">/{trimNum(m.lastTotal!)}</span>
              <span className="mock-score-pct">{Math.round(pct)}%</span>
            </span>
          </div>
          <div className="mock-score-track">
            <div className={`mock-score-fill tone-${tone}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <div className="mock-score mock-score-empty">
          <span className="mock-score-label">Not attempted yet</span>
          <div className="mock-score-track"><div className="mock-score-fill mock-score-fill-empty" /></div>
        </div>
      )}

      <div className="mock-card-actions">
        {m.attempted && (
          <button className="btn btn-ghost mock-secondary-btn" onClick={onViewResult}>
            View result
          </button>
        )}
        <button className="mock-start-btn" onClick={onStart}>
          {m.attempted ? 'Retake test' : 'Start test'}
        </button>
      </div>
    </article>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MockTests() {
  const navigate = useNavigate()
  const [mocks, setMocks] = useState<MockTestListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<string>('ALL')

  useEffect(() => {
    api.get('/mocks')
      .then(r => setMocks(r.data))
      .finally(() => setLoading(false))
  }, [])

  const visible = activeSection === 'ALL' ? mocks : mocks.filter(m => m.subject === activeSection)
  const bySection = SECTIONS
    .map(s => ({ section: s, items: visible.filter(m => m.subject === s) }))
    .filter(g => g.items.length > 0)

  const attemptedCount = mocks.filter(m => m.attempted).length
  const bestPct = mocks.reduce((best, m) => {
    if (!m.attempted || m.lastScore === null || m.lastTotal === null) return best
    return Math.max(best, scorePct(m.lastScore, m.lastTotal))
  }, -1)

  return (
    <>
      <Navbar />
      <div className="page" style={{ maxWidth: 1080 }}>

        <header className="mock-page-head">
          <div className="mock-page-headings">
            <h1 className="mock-page-title">Sectional Mock Tests</h1>
            <p className="mock-page-sub">
              Practice subject-wise tests. No rating impact — take them as many times as you like.
            </p>
          </div>
          {!loading && mocks.length > 0 && (
            <div className="mock-stats">
              <div className="mock-stat">
                <strong>{mocks.length}</strong>
                <span>Tests</span>
              </div>
              <div className="mock-stat">
                <strong>{attemptedCount}</strong>
                <span>Attempted</span>
              </div>
              <div className="mock-stat">
                <strong>{bestPct >= 0 ? `${Math.round(bestPct)}%` : '—'}</strong>
                <span>Best score</span>
              </div>
            </div>
          )}
        </header>

        <div className="mock-section-tabs">
          <button
            className={`mock-section-tab ${activeSection === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveSection('ALL')}
          >
            All tests
            <span className="mock-tab-count">{mocks.length}</span>
          </button>
          {SECTIONS.map(s => {
            const count = mocks.filter(m => m.subject === s).length
            if (count === 0) return null
            const isActive = activeSection === s
            return (
              <button
                key={s}
                className={`mock-section-tab ${isActive ? 'active' : ''}`}
                onClick={() => setActiveSection(s)}
                style={isActive
                  ? { background: SECTION_COLORS[s], borderColor: SECTION_COLORS[s], color: '#fff' }
                  : { ['--subject' as string]: SECTION_COLORS[s] }}
              >
                <span className="mock-tab-dot" style={{ background: SECTION_COLORS[s] }} />
                {SECTION_SHORT[s]}
                <span className="mock-tab-count">{count}</span>
              </button>
            )
          })}
        </div>

        {loading && (
          <div className="mock-grid">
            {[0, 1, 2, 3].map(i => <div key={i} className="mock-card-skeleton" />)}
          </div>
        )}

        {!loading && mocks.length === 0 && (
          <div className="card mock-empty">
            <div className="mock-empty-icon">📚</div>
            <p className="mock-empty-title">No mock tests yet</p>
            <p className="mock-empty-sub">New sectional tests are added regularly — check back soon.</p>
          </div>
        )}

        {!loading && bySection.map(({ section, items }) => (
          <section key={section} className="mock-section">
            <div className="mock-section-heading">
              <span className="mock-section-bar" style={{ background: SECTION_COLORS[section] }} />
              <h2 className="mock-section-name">{SECTION_LABELS[section]}</h2>
              <span className="mock-section-count">{items.length} test{items.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="mock-grid">
              {items.map(m => (
                <MockCard
                  key={m.id}
                  m={m}
                  onStart={() => navigate(`/mocks/${m.id}`)}
                  onViewResult={() => navigate(`/mocks/${m.id}/result`)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
