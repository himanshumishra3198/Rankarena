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
const SECTION_COLORS: Record<string, string> = {
  QUANT: '#7c3aed', REASONING: '#0ea5e9', ENGLISH: '#16a34a', GK: '#f59e0b',
}
const SECTION_ICONS: Record<string, string> = {
  QUANT: '🔢', REASONING: '🧩', ENGLISH: '📖', GK: '🌍',
}

function MockCard({ m, onStart }: { m: MockTestListItem; onStart: () => void }) {
  const totalMarks = m.questionCount * 2
  return (
    <div className="mock-card">
      <div className="mock-card-main">
        <div className="mock-card-title">{m.title}</div>
        <div className="mock-card-stats">
          <span className="mock-stat">❓ {m.questionCount} Questions</span>
          <span className="mock-stat">📄 {totalMarks} Marks</span>
          <span className="mock-stat">⏱ {m.durationMinutes} Mins</span>
          {m.attempted && m.lastScore !== null && (
            <span className="mock-stat mock-stat-score">
              ✓ Last: {m.lastScore}/{m.lastTotal}
            </span>
          )}
        </div>
      </div>
      <button className="mock-start-btn" onClick={onStart} style={{ background: SECTION_COLORS[m.subject] }}>
        {m.attempted ? 'Retake' : 'Start Now'}
      </button>
    </div>
  )
}

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

  return (
    <>
      <Navbar />
      <div className="page" style={{ maxWidth: 1000 }}>
        <h1 style={{ marginBottom: 6 }}>Sectional Mock Tests</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
          Practice subject-wise tests. No rating impact — take them as many times as you like.
        </p>

        {/* Section filter chips */}
        <div className="mock-section-tabs">
          <button className={`mock-section-tab ${activeSection === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveSection('ALL')}>All</button>
          {SECTIONS.map(s => (
            <button key={s}
              className={`mock-section-tab ${activeSection === s ? 'active' : ''}`}
              onClick={() => setActiveSection(s)}
              style={activeSection === s ? { background: SECTION_COLORS[s], borderColor: SECTION_COLORS[s], color: '#fff' } : {}}>
              {SECTION_ICONS[s]} {s === 'QUANT' ? 'Quant' : s === 'REASONING' ? 'Reasoning' : s === 'ENGLISH' ? 'English' : 'GK'}
            </button>
          ))}
        </div>

        {loading && <p style={{ color: 'var(--text-muted)' }}>Loading mock tests...</p>}
        {!loading && mocks.length === 0 && (
          <div className="card"><p className="empty">No mock tests available yet. Check back soon!</p></div>
        )}

        {bySection.map(({ section, items }) => (
          <div key={section} style={{ marginBottom: 28 }}>
            <div className="mock-section-heading">
              <span className="mock-section-dot" style={{ background: SECTION_COLORS[section] }} />
              {SECTION_LABELS[section]}
              <span className="mock-section-count">{items.length} test{items.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="mock-card-list">
              {items.map(m => (
                <MockCard key={m.id} m={m} onStart={() => navigate(`/mocks/${m.id}`)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
