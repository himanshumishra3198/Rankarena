// Renders the rich context for a question — reading passage, data table,
// or syllogism statements/conclusions — above the question text itself.
// Shared between ContestRoom (live exam) and Result (review) pages.
import { RichText } from './RichText'

interface PassageLike {
  id: string
  title: string
  content: string
  type: 'TEXT' | 'TABLE'
  tableData?: { headers: string[]; rows: string[][] } | null
}

interface QuestionLike {
  /** False when the chosen language has no translation and English is shown. */
  translated?: boolean
  language?: string
  text: string
  imageUrl?: string | null
  questionType?: 'STANDARD' | 'SYLLOGISM' | 'PASSAGE' | 'TABLE'
  structuredData?: { statements: string[]; conclusions: string[] } | null
  passage?: PassageLike | null
}

// Passage text is authored in a plain textarea, so it arrives as plain text
// with newlines. Blank lines separate paragraphs; single newlines are line
// breaks within one. Splitting here gives real paragraph spacing instead of
// leaning on white-space:pre-wrap, which renders a wall of text.
function PassageBody({ content }: { content: string }) {
  const paragraphs = content.replace(/\r\n/g, '\n').split(/\n{2,}/).filter(p => p.trim())
  if (paragraphs.length === 0) return null
  return (
    <div className="qc-passage-body">
      {paragraphs.map((para, i) => (
        <p key={i} className="qc-passage-para">
          {para.split('\n').map((line, j, arr) => (
            <span key={j}>
              {line}
              {j < arr.length - 1 && <br />}
            </span>
          ))}
        </p>
      ))}
    </div>
  )
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="qc-table-wrap">
      <table className="qc-table">
        <thead>
          <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Context-only: passage / table / syllogism. No image or question text.
// Use this when the host page renders its own image + text styling (e.g. Result review).
export function QuestionContext({ q }: { q: QuestionLike }) {
  const type = q.questionType ?? 'STANDARD'

  return (
    <>
      {/* Shown rather than blanking the question: a candidate mid-exam is far
          better served by text they may still be able to read, plus an honest
          note about why it is not in their language. */}
      {q.translated === false && (
        <div className="lang-fallback" role="note">
          <span aria-hidden="true">🌐</span>
          <span>This question is currently available only in English.</span>
        </div>
      )}
      {/* Passage / Table context block */}
      {q.passage && (
        <section className="qc-context" aria-label="Passage for this question">
          {/* A label makes it obvious this block is shared context and not the
              question itself — the two used to be easy to confuse. */}
          <div className="qc-context-label">
            {q.passage.type === 'TABLE' ? '📊 Data table' : '📄 Passage'}
          </div>
          {q.passage.title && <div className="qc-context-title">{q.passage.title}</div>}
          {q.passage.type === 'TABLE' && q.passage.tableData ? (
            <>
              {q.passage.content && <PassageBody content={q.passage.content} />}
              <DataTable headers={q.passage.tableData.headers} rows={q.passage.tableData.rows} />
            </>
          ) : (
            <PassageBody content={q.passage.content} />
          )}
        </section>
      )}

      {/* Syllogism: statements + conclusions */}
      {type === 'SYLLOGISM' && q.structuredData && (
        <div className="qc-syllogism">
          {q.structuredData.statements.length > 0 && (
            <div className="qc-syl-block">
              <div className="qc-syl-heading">Statements:</div>
              {q.structuredData.statements.map((s, i) => (
                <div key={i} className="qc-syl-item">
                  <span className="qc-syl-num">{i + 1}.</span> {s}
                </div>
              ))}
            </div>
          )}
          {q.structuredData.conclusions.length > 0 && (
            <div className="qc-syl-block">
              <div className="qc-syl-heading">Conclusions:</div>
              {q.structuredData.conclusions.map((c, i) => (
                <div key={i} className="qc-syl-item">
                  <span className="qc-syl-num">{['I', 'II', 'III', 'IV', 'V'][i] ?? `${i + 1}`}.</span> {c}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// Full render: context + image + question text. Use in the live exam room.
export function QuestionContent({ q }: { q: QuestionLike }) {
  return (
    <>
      <QuestionContext q={q} />

      {/* Question image */}
      {q.imageUrl && (
        <div className="question-image">
          <img src={q.imageUrl} alt="Question diagram" />
        </div>
      )}

      {/* Question text (may be empty for pure syllogism) */}
      {q.text && <RichText as="p" className="question-text" html={q.text} />}
    </>
  )
}
