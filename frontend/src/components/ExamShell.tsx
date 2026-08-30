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

export interface SectionTab {
  key: string
  label: string
  /** `locked` is a section not yet reachable; `submitted` is one already closed. */
  state: 'open' | 'submitted' | 'locked'
}

export default function ExamShell({
  title, rollNumber, timeLeft, timeWarn, partLabel,
  sectionTimeLeft, sectionTimeWarn,
  sections, currentSection, onSectionSelect,
  language, onLanguageChange, langBusy,
  onInstructions, onReport, onSubmit, submitLabel,
  answeredCount, stats, extraStats,
  palette, currentId, onSelect,
  questionNo, questionMeta, banner, children, actions, topRightExtra, analysisLabel,
}: {
  title: string
  rollNumber: string
  timeLeft: string
  timeWarn?: boolean
  /** "PART-A", or the section name in a sectional paper. */
  partLabel: string
  /** Second clock, shown only when the paper is sectionally timed. */
  sectionTimeLeft?: string
  sectionTimeWarn?: boolean
  /** Omit entirely for a single-part paper — the tab strip then disappears. */
  sections?: SectionTab[]
  currentSection?: string
  onSectionSelect?: (key: string) => void
  language: Language
  onLanguageChange: (l: Language) => void
  langBusy?: boolean
  onInstructions: () => void
  onReport: () => void
  onSubmit: () => void
  submitLabel?: string
  /** Paper-wide, for the header count. */
  answeredCount: number
  /**
   * Scoped to what the palette is showing — the section, in a sectional paper.
   * The four are disjoint, one per palette colour, so they read as a breakdown
   * rather than as overlapping tallies.
   */
  stats: { answered: number; notAnswered: number; marked: number; answeredMarked: number }
  /** Extra rows under the analysis table — average time, and the like. */
  extraStats?: { label: string; value: string }[]
  palette: PaletteCell[]
  currentId: string
  onSelect: (id: string) => void
  questionNo: number
  questionMeta?: ReactNode
  /** Full-width notices above the body: a locked section, a fullscreen warning. */
  banner?: ReactNode
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
          {sectionTimeLeft && (
            <div className="xr-secclock">
              <div className="xr-secclock-label">Section Time</div>
              <div className={`xr-secclock-value ${sectionTimeWarn ? 'warn' : ''}`}>{sectionTimeLeft}</div>
            </div>
          )}
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
          <button className="xr-btn" onClick={onSubmit}>{submitLabel ?? 'Submit Test'}</button>
        </div>
        <div className="xr-answered">
          Total Questions Answered: <b>{answeredCount}</b>
        </div>
      </div>

      {/* Section tabs sit between the controls and the paper, the way a
          sectionally-timed exam presents them: always visible, so which part
          you are in and which are still locked never needs looking for. */}
      {sections && sections.length > 1 && (
        <div className="xr-sections" role="tablist" aria-label="Sections">
          {sections.map(s => (
            <button
              key={s.key}
              role="tab"
              aria-selected={s.key === currentSection}
              className={`xr-sec ${s.key === currentSection ? 'active' : ''} ${s.state === 'submitted' ? 'submitted' : ''}`}
              disabled={s.state === 'locked'}
              title={s.state === 'locked' ? 'Submit the current section to unlock this one' : undefined}
              onClick={() => onSectionSelect?.(s.key)}
            >
              {s.label}
              {s.state === 'submitted' && <span aria-hidden="true">✓</span>}
              {s.state === 'locked' && <span aria-hidden="true">🔒</span>}
            </button>
          ))}
        </div>
      )}

      {banner}

      <div className="xr-body">
        <div className="xr-main">
          <div className="xr-qno">
            Question No. {questionNo}
            {questionMeta && <span className="xr-qmeta">{questionMeta}</span>}
          </div>
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
          <div className="xr-side-head">{analysisLabel ?? partLabel}</div>
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
            <div className="xr-analysis-row"><span>Answered</span><b>{stats.answered}</b></div>
            <div className="xr-analysis-row"><span>Not Answered</span><b>{stats.notAnswered}</b></div>
            <div className="xr-analysis-row"><span>Marked for Review</span><b>{stats.marked}</b></div>
            <div className="xr-analysis-row"><span>Answered &amp; Marked</span><b>{stats.answeredMarked}</b></div>
            {extraStats?.map(s => (
              <div className="xr-analysis-row" key={s.label}><span>{s.label}</span><b>{s.value}</b></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
