import type { Contest } from '../lib/types'

import LanguagePicker from './LanguagePicker'
import type { Language } from '../lib/language'

interface Props {
  contest: Contest
  sections: string[]
  sectionTimeMinutes: number
  /** Absent when the sheet is re-opened mid-exam — it then only closes. */
  onStart?: () => void
  onClose?: () => void
  language: Language
  onLanguageChange: (l: Language) => void
}

const SECTION_LABELS: Record<string, string> = {
  QUANT: 'Quantitative Aptitude',
  REASONING: 'Logical Reasoning',
  ENGLISH: 'English Language',
  GK: 'General Knowledge',
}

export default function InstructionsModal({ contest, sections, sectionTimeMinutes, onStart, onClose, language, onLanguageChange }: Props) {
  return (
    <div className="modal-overlay">
      <div className="modal-box instructions-modal">
        <div className="instructions-header">
          <h2>{contest.title}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>Read all instructions carefully before starting</p>
        </div>

        <div className="instructions-meta-grid">
          <div className="instructions-meta-item">
            <span className="meta-label">Total Duration</span>
            <span className="meta-value">{contest.durationMinutes} minutes</span>
          </div>
          <div className="instructions-meta-item">
            <span className="meta-label">Sections</span>
            <span className="meta-value">{sections.length}</span>
          </div>
          <div className="instructions-meta-item">
            <span className="meta-label">Time per Section</span>
            <span className="meta-value">{sectionTimeMinutes} min</span>
          </div>
          <div className="instructions-meta-item">
            <span className="meta-label">Negative Marking</span>
            <span className="meta-value" style={{ color: 'var(--danger)' }}>−{contest.negativeMarks} per wrong</span>
          </div>
        </div>

        <div className="instructions-sections">
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Sections in this exam</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sections.map(s => (
              <span key={s} style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
                {SECTION_LABELS[s] ?? s}
              </span>
            ))}
          </div>
        </div>

        <div className="instructions-rules">
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Rules &amp; Guidelines</h3>
          <ol className="rules-list">
            <li>Each section has a strict time limit of <strong>{sectionTimeMinutes} minutes</strong>. The section is <strong>auto-submitted</strong> when its timer expires.</li>
            <li>Once a section is submitted, you <strong>cannot revisit or change</strong> any answers in it.</li>
            <li>Use <strong>🔖 Mark for Review</strong> to flag questions you want to revisit within the section before submitting it.</li>
            <li>Your answers are auto-saved every 30 seconds. You can safely refresh without losing answers.</li>
            <li><strong>Do not switch browser tabs</strong> — each tab switch is logged.</li>
            <li>The exam will run in <strong>fullscreen mode</strong>. Exiting fullscreen will trigger a warning.</li>
            <li>A <strong>calculator</strong> is available via the toolbar for all sections.</li>
            <li>Unanswered questions score 0. Wrong answers deduct <strong>−{contest.negativeMarks}</strong> marks.</li>
          </ol>
        </div>

        <div className="instructions-legend">
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Question Status Colors</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 13 }}>
            {[
              { cls: 'qs-not-visited',     label: 'Not Visited' },
              { cls: 'qs-not-answered',    label: 'Not Answered' },
              { cls: 'qs-answered',        label: 'Answered' },
              { cls: 'qs-marked',          label: 'Marked for Review' },
              { cls: 'qs-answered-marked', label: 'Answered + Marked' },
            ].map(({ cls, label }) => (
              <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`legend-dot ${cls}`} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {onStart ? (
          <>
            <LanguagePicker value={language} onChange={onLanguageChange} />
            <button className="btn btn-primary btn-full" style={{ marginTop: 4 }} onClick={onStart}>
              I understand — Start Exam →
            </button>
          </>
        ) : (
          <button className="btn btn-primary btn-full" style={{ marginTop: 4 }} onClick={onClose}>
            Back to the exam
          </button>
        )}
      </div>
    </div>
  )
}
