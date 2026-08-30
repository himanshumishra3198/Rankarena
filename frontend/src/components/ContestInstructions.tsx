import { LogoMark } from './Logo'
import { LANGUAGES, type Language } from '../lib/language'
import type { Contest } from '../lib/types'

/**
 * The instructions sheet a candidate reads before the paper opens.
 *
 * Modelled on the SSC/TCS sheet, down to the section table and the symbol
 * key, because it is the screen candidates have already read a dozen times
 * before exam day — and because the symbol key here has to describe the
 * palette in the room next door. The colours below are the room's own
 * `.xr-cell` classes rather than a re-drawn legend, so the two cannot drift.
 *
 * Also reachable mid-exam from the INSTRUCTIONS link, where `onStart` is
 * absent and the sheet only closes.
 */

export interface SectionRow {
  key: string
  label: string
  questions: number
  maxScore: number
  minutes: number
  /** Every language every question in the section exists in. */
  languages: Language[]
}

function Silhouette() {
  return (
    <svg className="xi-silhouette" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="7.4" r="4.6" />
      <path d="M1.6 24c0-5.2 4.6-9.2 10.4-9.2s10.4 4 10.4 9.2z" />
    </svg>
  )
}

function languageText(langs: Language[]) {
  if (langs.length === 0) return 'English'
  return langs
    .map(l => LANGUAGES.find(x => x.code === l)?.label ?? l)
    .join(' & ')
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h} Hr ${m} Min`
  if (h) return `${h} Hr`
  return `${m} Min`
}

export default function ContestInstructions({
  contest, sections, totalQuestions, language, onLanguageChange, onStart, onClose,
}: {
  contest: Contest
  sections: SectionRow[]
  totalQuestions: number
  language: Language
  onLanguageChange: (l: Language) => void
  /** Absent when re-opened mid-exam — the sheet then only closes. */
  onStart?: () => void
  onClose?: () => void
}) {
  return (
    <div className="xi">
      <div className="xi-top">
        <LogoMark size={40} />
        <div className="xi-title">{contest.title}</div>
      </div>

      <div className="xi-body">
        <div className="xi-sheet">
          <h2 className="xi-heading">Please read the following instructions carefully</h2>

          <p className="xi-meta"><b>Total Number of Questions:</b> {totalQuestions}</p>
          <p className="xi-meta"><b>Total Time Available:</b> {formatDuration(contest.durationMinutes)}</p>

          <div className="xi-tablewrap">
          <table className="xi-table">
            <thead>
              <tr>
                <th>Section Name</th>
                <th>Total Number of Questions</th>
                <th>Max Score</th>
                <th>Language</th>
                <th>Time (minutes)</th>
              </tr>
            </thead>
            <tbody>
              {sections.map(s => (
                <tr key={s.key}>
                  <td>{s.label}</td>
                  <td>{s.questions}</td>
                  <td>{s.maxScore}</td>
                  <td>{languageText(s.languages)}</td>
                  <td>{s.minutes} Mins</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <p className="xi-lead">
            The different symbols used in the next pages are shown below. Please go through
            them and understand their meaning before you start the test.
          </p>

          <table className="xi-symbols">
            <thead>
              <tr><th>Symbol</th><th>Meaning</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><input type="radio" readOnly checked={false} tabIndex={-1} /></td>
                <td>Option Not Chosen</td>
              </tr>
              <tr>
                <td><input type="radio" readOnly checked tabIndex={-1} /></td>
                <td>
                  Option Chosen as correct (By clicking on it again you can delete your option
                  and choose another option if selected)
                </td>
              </tr>
              {/* The room's own palette classes, so the key cannot describe
                  colours the room does not use. */}
              <tr>
                <td><span className="xr-cell not-visited">1</span></td>
                <td>Question number shown in grey indicates that you have not yet visited the question</td>
              </tr>
              <tr>
                <td><span className="xr-cell not-answered">1</span></td>
                <td>Question number shown in red indicates that you have visited the question but not answered it</td>
              </tr>
              <tr>
                <td><span className="xr-cell answered">1</span></td>
                <td>Question number shown in green indicates that you have answered the question</td>
              </tr>
              <tr>
                <td><span className="xr-cell marked">1</span></td>
                <td>Question number shown in purple indicates that you have marked the question for review</td>
              </tr>
              <tr>
                <td><span className="xr-cell answered-marked">1</span></td>
                <td>
                  Question number shown in purple with a green bar indicates that you have answered
                  the question and also marked it for review
                </td>
              </tr>
            </tbody>
          </table>

          <p className="xi-lead">Please read the rules of this contest before you begin.</p>

          <ol className="xi-rules">
            <li>
              Each section has its own time limit, shown in the table above. A section is
              <b> submitted automatically</b> when its timer expires.
            </li>
            <li>
              Sections are attempted <b>in order</b>. Once a section is submitted you can reopen it
              to review, but <b>not to change any answer</b>.
            </li>
            <li>
              Use <b>Mark for Review</b> to flag a question you want to come back to within the
              section before submitting it.
            </li>
            <li>
              Every wrong answer deducts <b>−{contest.negativeMarks}</b> marks. Unanswered questions
              score <b>0</b>.
            </li>
            <li>Your answers are saved automatically. You can refresh without losing them.</li>
            <li>
              The exam runs in <b>fullscreen</b>. Leaving fullscreen shows a warning, and every
              <b> tab switch is recorded</b>.
            </li>
            <li>A <b>calculator</b> is available from the toolbar throughout the paper.</li>
            <li>
              You may change the paper's language at any time from <b>Select Language</b> in the
              question panel. Your answers are kept.
            </li>
          </ol>
        </div>

        {/* A placeholder until candidates can upload a photo — the same thing
            the real sheet shows before capture. */}
        <div className="xi-photo">
          <Silhouette />
          <div className="xi-photo-cap">Your photo appears here</div>
        </div>
      </div>

      <div className="xi-foot">
        {onStart ? (
          <>
            <label className="xi-choose">
              Choose Language:
              <select value={language} onChange={e => onLanguageChange(e.target.value as Language)}>
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </label>
            <button className="xi-start" onClick={onStart}>
              Start Test in {contest.title} Interface
            </button>
          </>
        ) : (
          <button className="xi-start" onClick={onClose}>Back to the exam</button>
        )}
      </div>
    </div>
  )
}
