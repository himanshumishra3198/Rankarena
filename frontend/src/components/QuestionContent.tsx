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
  text: string
  imageUrl?: string | null
  questionType?: 'STANDARD' | 'SYLLOGISM' | 'PASSAGE' | 'TABLE'
  structuredData?: { statements: string[]; conclusions: string[] } | null
  passage?: PassageLike | null
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
      {/* Passage / Table context block */}
      {q.passage && (
        <div className="qc-context">
          {q.passage.title && <div className="qc-context-title">{q.passage.title}</div>}
          {q.passage.type === 'TABLE' && q.passage.tableData ? (
            <>
              {q.passage.content && <p className="qc-context-text">{q.passage.content}</p>}
              <DataTable headers={q.passage.tableData.headers} rows={q.passage.tableData.rows} />
            </>
          ) : (
            <p className="qc-context-text qc-passage-text">{q.passage.content}</p>
          )}
        </div>
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
