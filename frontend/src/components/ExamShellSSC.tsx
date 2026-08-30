import type { ReactNode } from 'react'
import { LANGUAGES, type Language } from '../lib/language'
import type { PaletteCell } from './ExamShell'

/**
 * The mock-test room chrome, modelled on the SSC/TCS practice interface.
 *
 * A sibling of ExamShell rather than a variant of it: the two imitate two
 * different real screens, and folding them together would mean a component
 * whose every region has an if in it. They share the palette cell type and
 * nothing else.
 *
 * Fixed light colours throughout, no theme variables. The interface being
 * imitated has one appearance, and a candidate practising on a dark version of
 * it would be practising on something they will never sit.
 */

function Avatar() {
  return (
    <div className="xs-avatar" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="7.6" r="4.2" />
        <path d="M2.6 24c0-4.9 4.2-8.6 9.4-8.6s9.4 3.7 9.4 8.6z" />
      </svg>
    </div>
  )
}

export interface ExamStats {
  answered: number
  notAnswered: number
  marked: number
  answeredMarked: number
}

export default function ExamShellSSC({
  title, timeLeft, timeWarn,
  zoomPct, onZoomIn, onZoomOut,
  isFullscreen, onToggleFullscreen,
  paused, onTogglePause,
  onInstructions, sectionLabel, answeredCount,
  actions, toolbarExtra,
  questionNo, questionMeta,
  language, onLanguageChange, langBusy, onReport,
  children,
  palette, currentId, onSelect, paletteHeading,
  stats, sideFooter, footer,
}: {
  title: string
  timeLeft: string
  timeWarn?: boolean
  /** Font scale for the question pane, as a percentage. */
  zoomPct: number
  onZoomIn: () => void
  onZoomOut: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
  /** Pause is offered only when a handler is given — a rated paper has none. */
  paused?: boolean
  onTogglePause?: () => void
  onInstructions: () => void
  /** The green tag: the subject or section being attempted. */
  sectionLabel: string
  answeredCount: number
  /** Previous / Mark for Review / Save & Next and friends. */
  actions: ReactNode
  /** Sound, and anything else that belongs beside the zoom controls. */
  toolbarExtra?: ReactNode
  questionNo: number
  questionMeta?: ReactNode
  language: Language
  onLanguageChange: (l: Language) => void
  langBusy?: boolean
  onReport: () => void
  /** Question text and options. */
  children: ReactNode
  palette: PaletteCell[]
  currentId: string
  onSelect: (id: string) => void
  paletteHeading: string
  stats: ExamStats
  sideFooter?: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className={`xs ${paused ? 'paused' : ''}`}>
      <div className="xs-top">
        <div className="xs-tools">
          <div className="xs-tools-row">
            <button className="xs-tool" onClick={onZoomIn} disabled={zoomPct >= 150}>Zoom (+)</button>
            <button className="xs-tool" onClick={onZoomOut} disabled={zoomPct <= 80}>Zoom (−)</button>
            {toolbarExtra}
          </div>
          <button className="xs-tool xs-tool-wide" onClick={onToggleFullscreen}>
            {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
          </button>
        </div>

        <div className="xs-title">{title}</div>

        <div className="xs-topright">
          <div className="xs-clock">
            <span className="xs-clock-label">Time Left:</span>{' '}
            <span className={`xs-clock-value ${timeWarn ? 'warn' : ''}`}>{timeLeft}</span>
          </div>
          {onTogglePause && (
            <button className="xs-pause" onClick={onTogglePause}>
              <span className="xs-pause-icon" aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
              {paused ? 'Resume Test' : 'Pause Test'}
            </button>
          )}
        </div>

        {/* A placeholder until candidates can upload a photo. A grey silhouette
            is what the real interface shows before capture, so it reads as
            "not yet" rather than as an image failing to load. */}
        <Avatar />
      </div>

      <div className="xs-actions">
        <div className="xs-actions-left">
          <button className="xs-link" onClick={onInstructions}>INSTRUCTIONS</button>
          <span className="xs-section-tag">{sectionLabel}</span>
        </div>
        <div className="xs-actions-right">
          <div className="xs-answered">
            Total Questions answered : <b>{answeredCount}</b>
          </div>
          <div className="xs-btns">{actions}</div>
        </div>
      </div>

      <div className="xs-body">
        <div className="xs-main">
          <div className="xs-card">
            <div className="xs-card-head">
              <span className="xs-qno">Question No {questionNo}</span>
              {questionMeta && <span className="xs-qmeta">{questionMeta}</span>}
              <label className="xs-langsel">
                Choose Language:
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
              <button className="xs-report" onClick={onReport} title="Report a problem with this question">
                ⚑ Report
              </button>
            </div>
            {/* `zoom` reflows rather than scaling a bitmap, so the question pane
                grows without the rest of the room moving. */}
            <div className="xs-qbody" style={{ zoom: `${zoomPct}%` }}>
              {children}
            </div>
          </div>
          {footer}
        </div>

        <div className="xs-side">
          <div className="xs-side-head">{paletteHeading} :</div>
          <div className="xs-palette">
            {palette.map(c => (
              <button
                key={c.id}
                className={`xs-cell ${c.state} ${c.id === currentId ? 'current' : ''}`}
                disabled={c.disabled}
                onClick={() => onSelect(c.id)}
                title={c.state.replace(/-/g, ' ')}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="xs-analytics">
            <div className="xs-analytics-head">Analytics</div>
            <div className="xs-analytics-row"><span>Answered</span><b>{stats.answered}</b></div>
            <div className="xs-analytics-row"><span>Not Answered</span><b>{stats.notAnswered}</b></div>
            <div className="xs-analytics-row"><span>Marked for review</span><b>{stats.marked}</b></div>
            <div className="xs-analytics-row"><span>Answered &amp; Marked for review</span><b>{stats.answeredMarked}</b></div>
          </div>

          {sideFooter}
        </div>
      </div>

      {/* Covers the paper, not just the clock: a pause that left the questions
          readable would be extra time with a different name. */}
      {paused && onTogglePause && (
        <div className="xs-paused">
          <div className="xs-paused-box">
            <div className="xs-paused-title">Test Paused</div>
            <p>The clock is stopped and the paper is hidden. Pick up where you left off whenever you are ready.</p>
            <button className="xs-btn" onClick={onTogglePause}>Resume Test</button>
          </div>
        </div>
      )}
    </div>
  )
}
