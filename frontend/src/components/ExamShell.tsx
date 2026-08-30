import type { ReactNode } from 'react'
import { LANGUAGES, type Language } from '../lib/language'

/**
 * The exam-room chrome: top bar, action strip, question pane and palette.
 *
 * Modelled on the TCS/SSC interface candidates actually sit. Familiarity beats
 * house style here — on exam day nobody wants to learn a new layout, and a
 * candidate who has practised on this should recognise the real thing.
 *
 * Shared by the contest and mock rooms, which had drifted into two different
 * layouts for the same job. The parts that genuinely differ — sections,
 * per-section timers — are passed in.
 */

function Silhouette() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 24c0-4.4 3.6-8 8-8s8 3.6 8 8z" />
    </svg>
  )
}

export interface PaletteCell {
  id: string
  label: number
  state: 'answered' | 'not-answered' | 'marked' | 'answered-marked' | 'not-visited'
  disabled?: boolean
}

export default function ExamShell({
  title, rollNumber, timeLeft, timeWarn, partLabel,
  language, onLanguageChange, langBusy,
  onInstructions, onReport, onSubmit,
  answeredCount, totalCount, markedCount,
  palette, currentId, onSelect,
  questionNo, children, actions, topRightExtra, analysisLabel,
}: {
  title: string
  rollNumber: string
  timeLeft: string
  timeWarn?: boolean
  /** "PART-A", or the section name in a sectional paper. */
  partLabel: string
  language: Language
  onLanguageChange: (l: Language) => void
  langBusy?: boolean
  onInstructions: () => void
  onReport: () => void
  onSubmit: () => void
  answeredCount: number
  totalCount: number
  markedCount: number
  palette: PaletteCell[]
  currentId: string
  onSelect: (id: string) => void
  questionNo: number
  /** The question text and options. */
  children: ReactNode
  /** Mark for Review / Save & Next — they differ between the two rooms. */
  actions: ReactNode
  topRightExtra?: ReactNode
  analysisLabel?: string
}) {
  return (
    <div className="xr">
      <div className="xr-top">
        <div className="xr-brand">
          <span className="xr-brand-name">RankArenas</span>
          <span className="xr-brand-sub">{title}</span>
        </div>

        <div className="xr-title">
          <div className="xr-title-main">{title}</div>
          <div className="xr-roll">Roll No : {rollNumber}</div>
        </div>

        <div className="xr-topright">
          {topRightExtra}
          <div className="xr-clock">
            <div className="xr-clock-label">Time Left</div>
            <div className={`xr-clock-value ${timeWarn ? 'warn' : ''}`}>{timeLeft}</div>
          </div>
          {/* Placeholders until photo capture exists. Grey silhouettes are what
              the real interface shows before capture, so they read as "not yet"
              rather than as something failing to load. */}
          <div className="xr-photos">
            {['Registration Photo', 'Captured Photo'].map(cap => (
              <div className="xr-photo" key={cap}>
                <div className="xr-photo-box"><Silhouette /></div>
                <div className="xr-photo-cap">{cap}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="xr-actions">
        <div className="xr-actions-left">
          <button className="xr-link" onClick={onInstructions}>INSTRUCTIONS</button>
          <span className="xr-part">{partLabel}</span>
        </div>
        <div className="xr-actions-mid">
          {actions}
          <button className="xr-btn" onClick={onSubmit}>Submit Test</button>
        </div>
        <div className="xr-answered">
          Total Questions Answered: <b>{answeredCount}</b>
        </div>
      </div>

      <div className="xr-body">
        <div className="xr-main">
          <div className="xr-qno">Question No. {questionNo}</div>
          <div className="xr-card">
            <div className="xr-card-head">
              <label className="xr-langsel">
                Select Language
                <select
                  value={language}
                  disabled={langBusy}
                  onChange={e => onLanguageChange(e.target.value as Language)}
                >
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.native}</option>
                  ))}
                </select>
              </label>
              <button className="xr-report" onClick={onReport}>⚠ Report</button>
            </div>
            {children}
          </div>
        </div>

        <div className="xr-side">
          <div className="xr-side-head">Test</div>
          <div className="xr-palette">
            {palette.map(c => (
              <button
                key={c.id}
                className={`xr-cell ${c.state} ${c.id === currentId ? 'current' : ''}`}
                disabled={c.disabled}
                onClick={() => onSelect(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="xr-analysis">
            <div className="xr-analysis-head">{analysisLabel ?? partLabel} Analysis</div>
            <div className="xr-analysis-row"><span>Answered</span><b>{answeredCount}</b></div>
            <div className="xr-analysis-row"><span>Not Answered</span><b>{totalCount - answeredCount}</b></div>
            <div className="xr-analysis-row"><span>Mark for Review</span><b>{markedCount}</b></div>
          </div>
        </div>
      </div>
    </div>
  )
}
