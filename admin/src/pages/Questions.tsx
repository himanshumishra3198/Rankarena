import { useEffect, useState } from 'react'
import { useConfirm } from '../components/ConfirmDialog'
import type { FormEvent } from 'react'
import api from '../lib/api'
import { TOPICS_BY_SUBJECT } from '../lib/topics'
import Navbar from '../components/Navbar'
import { RichText, stripHtml } from '../components/RichText'
import QuestionContentTabs, {
  hindiCompleteOf, hindiStartedOf, translationsPayload,
} from '../components/QuestionContentTabs'
import type { Exam, Question, Passage, QuestionType } from '../lib/types'
import AnswerKeyEditor, {
  EMPTY_ANSWER_KEY, answerKeyError, answerKeyFrom, answerKeyPayload, answerLabel,
} from '../components/AnswerKeyEditor'
import TagPicker, { TagChip } from '../components/TagPicker'
import QuestionPreview from '../components/QuestionPreview'
import { useExams, sectionsOf, specOf } from '../lib/exams'
// Still used by the bank listing's Languages column, not by the editor.
import { LANGUAGES } from '../lib/types'
import type { Language } from '../lib/types'

const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const
const SUBJECT_LABELS: Record<string, string> = {
  QUANT: 'Quantitative Aptitude', REASONING: 'Logical Reasoning',
  ENGLISH: 'English Language', GK: 'General Knowledge',
  VARC: 'Verbal Ability & RC', DILR: 'Data Interpretation & LR',
  QA: 'Quantitative Ability',
}

const TYPE_LABELS: Record<QuestionType, string> = {
  STANDARD: 'Standard MCQ',
  SYLLOGISM: 'Syllogism / Logic',
  PASSAGE: 'Passage-based',
  TABLE: 'Table-based',
  MSQ: 'Multiple correct (MSQ)',
  TITA: 'Type the answer (TITA)',
}
const TYPE_DESCRIPTIONS: Record<QuestionType, string> = {
  STANDARD: 'Regular question with text and 4 options',
  SYLLOGISM: 'Statements + Conclusions in bold format',
  PASSAGE: 'Question linked to a reading passage',
  TABLE: 'Question linked to a data table',
  MSQ: 'Several options are correct; the candidate ticks each one',
  TITA: 'No options — the candidate types a number or a word',
}

const emptyForm = {
  questionType: 'STANDARD' as QuestionType,
  exam: 'SSC_CGL' as Exam,
  text: '',
  imageUrl: '',
  optionA: '', optionB: '', optionC: '', optionD: '',
  // The answer key, in all three shapes. Only the one matching the chosen
  // format is sent — see answerKeyPayload.
  ...EMPTY_ANSWER_KEY,
  subject: 'REASONING' as Question['subject'],
  topic: '',
  tagIds: [] as string[],
  difficulty: 'MEDIUM' as Question['difficulty'],
  passageId: '',
  solution: '',
  // Syllogism fields
  statements: ['', '', ''],
  conclusions: ['', '', ''],
  // Non-English content, keyed by language. English stays in the fields above
  // — it is the source, not a translation of anything. Adding a language means
  // another key here, not another set of form fields.
  hi: { text: '', optionA: '', optionB: '', optionC: '', optionD: '', solution: '' },
}

const emptyPassageForm = {
  title: '',
  content: '',
  type: 'TEXT' as Passage['type'],
  headers: [''],
  rows: [['']],
}

// ── Table builder helpers ─────────────────────────────────────────────────────
function TableBuilder({ headers, rows, onChange }: {
  headers: string[]; rows: string[][]
  onChange: (h: string[], r: string[][]) => void
}) {
  function setHeader(i: number, v: string) {
    const h = [...headers]; h[i] = v; onChange(h, rows)
  }
  function addCol() {
    onChange([...headers, ''], rows.map(r => [...r, '']))
  }
  function removeCol(i: number) {
    if (headers.length <= 1) return
    onChange(headers.filter((_, j) => j !== i), rows.map(r => r.filter((_, j) => j !== i)))
  }
  function setCell(ri: number, ci: number, v: string) {
    const r = rows.map(row => [...row]); r[ri][ci] = v; onChange(headers, r)
  }
  function addRow() {
    onChange(headers, [...rows, headers.map(() => '')])
  }
  function removeRow(i: number) {
    if (rows.length <= 1) return
    onChange(headers, rows.filter((_, j) => j !== i))
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ border: '1px solid var(--border)', padding: '4px 8px', background: 'var(--bg)' }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input className="input" value={h} onChange={e => setHeader(i, e.target.value)}
                    placeholder={`Col ${i + 1}`} style={{ fontSize: 12, padding: '2px 6px' }} />
                  <button type="button" onClick={() => removeCol(i)}
                    style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
              </th>
            ))}
            <th style={{ border: '1px solid var(--border)', padding: 4 }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={addCol}>+ Col</button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ border: '1px solid var(--border)', padding: 4 }}>
                  <input className="input" value={cell} onChange={e => setCell(ri, ci, e.target.value)}
                    style={{ fontSize: 12, padding: '2px 6px' }} />
                </td>
              ))}
              <td style={{ border: '1px solid var(--border)', padding: 4 }}>
                <button type="button" onClick={() => removeRow(ri)}
                  style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={addRow}>+ Row</button>
    </div>
  )
}

// ── Preview components ────────────────────────────────────────────────────────
function PassagePreview({ passage }: { passage: Passage }) {
  if (passage.type === 'TABLE' && passage.tableData) {
    const { headers, rows } = passage.tableData
    return (
      <div style={{ background: 'var(--bg)', borderRadius: 6, padding: 12, fontSize: 13 }}>
        {passage.title && <div style={{ fontWeight: 600, marginBottom: 8 }}>{passage.title}</div>}
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>{headers.map((h, i) => (
              <th key={i} style={{ border: '1px solid var(--border)', padding: '4px 10px', background: 'var(--surface-raised)', fontWeight: 600 }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>{row.map((cell, j) => (
                <td key={j} style={{ border: '1px solid var(--border)', padding: '4px 10px', textAlign: 'center' }}>{cell}</td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return (
    <div style={{ background: 'var(--bg)', borderRadius: 6, padding: 12, fontSize: 13, lineHeight: 1.7 }}>
      {passage.title && <div style={{ fontWeight: 600, marginBottom: 8 }}>{passage.title}</div>}
      <div style={{ whiteSpace: 'pre-wrap' }}>{passage.content}</div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Questions() {
  const confirm = useConfirm()
  const [questions, setQuestions] = useState<Question[]>([])
  const [passages, setPassages] = useState<Passage[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'questions' | 'passages'>('questions')
  const [showForm, setShowForm] = useState(false)
  const [showPassageForm, setShowPassageForm] = useState(false)
  const [filterTopic, setFilterTopic] = useState('')
  const [search, setSearch] = useState('')            // what's typed
  const [searchQuery, setSearchQuery] = useState('')  // what's been sent
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const PER_PAGE = 25
  const [form, setForm] = useState(emptyForm)
  // Which language tab is showing. Reset to English whenever the form opens,
  // so a new question always starts on the source language.
  const [activeLang, setActiveLang] = useState<Language>('EN')
  // Taken from the shared editor's own rule rather than a second copy of it
  // here, so the pre-submit check and the tab's status chip can never disagree
  // about what counts as half-translated.
  const hindiStarted = hindiStartedOf(form.hi)
  const hindiComplete = hindiCompleteOf(form.hi)
  const [passageForm, setPassageForm] = useState(emptyPassageForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [filterSubject, setFilterSubject] = useState('')
  const [filterType, setFilterType] = useState('')
  // '' is every exam, so the bank still opens on the whole bank.
  const [filterExam, setFilterExam] = useState<'' | Exam>('')
  const [filterTagIds, setFilterTagIds] = useState<string[]>([])
  const [similar, setSimilar] = useState<{ id: string; text: string; subject: string; score: number }[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingPassageId, setEditingPassageId] = useState<string | null>(null)

  // Sections and answer formats come from the API, so the panel cannot offer
  // a combination the server will refuse.
  const { catalogue, error: examError } = useExams()
  const examSections = sectionsOf(catalogue, form.exam)
  const allowedTypes: QuestionType[] =
    specOf(catalogue, form.exam)?.questionTypes ?? ['STANDARD', 'SYLLOGISM', 'PASSAGE', 'TABLE']

  /**
   * The syllabus topic list for a section, which only SSC has.
   *
   * Returns nothing for a CAT section rather than throwing: TOPICS_BY_SUBJECT
   * is keyed by the four SSC subjects, and indexing it with VARC used to be a
   * type error and would now be an undefined at runtime.
   */
  /**
   * The sections and formats the bank's filters offer.
   *
   * With an exam chosen, only that exam's. With none, every section of every
   * exam — de-duplicated, because two exams could in principle share one.
   */
  const bankSections = (filterExam
    ? sectionsOf(catalogue, filterExam)
    : (catalogue?.exams ?? []).flatMap(e => e.sections)
  ).filter((sec, i, all) => all.findIndex(x => x.key === sec.key) === i)

  const bankTypes: QuestionType[] = [...new Set(
    (filterExam
      ? specOf(catalogue, filterExam)?.questionTypes ?? []
      : (catalogue?.exams ?? []).flatMap(e => e.questionTypes)),
  )]

  function topicsFor(subject: string): string[] {
    return (TOPICS_BY_SUBJECT as Record<string, string[] | undefined>)[subject] ?? []
  }

  /**
   * Switching examination.
   *
   * Clears the section, topic, tags and — if it is not available on the new
   * exam — the answer format, because none of them carry over. Leaving a VARC
   * section selected on an SSC question would be rejected on save with an
   * error about a field the admin cannot see they changed.
   */
  function pickExam(exam: Exam) {
    const spec = catalogue?.exams.find(e => e.key === exam)
    const firstSection = spec?.sections[0]?.key
    setForm(f => ({
      ...f,
      exam,
      subject: (firstSection ?? f.subject) as Question['subject'],
      topic: '',
      tagIds: [],
      questionType: spec && !spec.questionTypes.includes(f.questionType)
        ? 'STANDARD'
        : f.questionType,
    }))
  }

  // Debounced near-duplicate check as the admin types the question text.
  useEffect(() => {
    if (!showForm) { setSimilar([]); return }
    const t = form.text.trim()
    if (t.length < 8) { setSimilar([]); return }
    const handle = setTimeout(async () => {
      try {
        const res = await api.get('/admin/questions/similar', { params: { text: t, subject: form.subject } })
        // Don't flag the question currently being edited as its own duplicate.
        setSimilar((res.data as any[]).filter(s => s.id !== editingId))
      } catch { setSimilar([]) }
    }, 500)
    return () => clearTimeout(handle)
  }, [form.text, form.subject, showForm, editingId])

  async function handleImageUpload(file: File) {
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await api.post('/admin/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setForm(f => ({ ...f, imageUrl: res.data.url }))
    } catch (err: any) {
      setError(errMsg(err, 'Image upload failed'))
    } finally { setUploading(false) }
  }

  // Backend may return `error` as a string OR a Zod issues array — normalise to a string.
  function errMsg(err: any, fallback: string): string {
    const e = err?.response?.data?.error
    if (typeof e === 'string') return e
    if (Array.isArray(e)) return e.map((i: any) => i?.message).filter(Boolean).join(', ') || fallback
    return fallback
  }

  function set<K extends keyof typeof emptyForm>(field: K, value: typeof emptyForm[K]) {
    setForm(f => ({ ...f, [field]: value }))
  }
  function setStatement(i: number, v: string) {
    const s = [...form.statements]; s[i] = v; set('statements', s as any)
  }
  function setConclusion(i: number, v: string) {
    const c = [...form.conclusions]; c[i] = v; set('conclusions', c as any)
  }
  function addStatement() { set('statements', [...form.statements, ''] as any) }
  function addConclusion() { set('conclusions', [...form.conclusions, ''] as any) }
  function removeStatement(i: number) {
    set('statements', form.statements.filter((_, j) => j !== i) as any)
  }
  function removeConclusion(i: number) {
    set('conclusions', form.conclusions.filter((_, j) => j !== i) as any)
  }

  async function load() {
    setLoading(true)
    const [qRes, pRes] = await Promise.all([
      api.get('/admin/questions', {
        params: {
          ...(filterSubject ? { subject: filterSubject } : {}),
          ...(filterTopic ? { topic: filterTopic } : {}),
          ...(filterType ? { questionType: filterType } : {}),
          ...(filterExam ? { exam: filterExam } : {}),
          // Comma-joined: the server accepts that as well as repeated keys,
          // and it keeps the URL readable.
          ...(filterTagIds.length ? { tagIds: filterTagIds.join(',') } : {}),
          ...(searchQuery ? { search: searchQuery } : {}),
          page,
          perPage: PER_PAGE,
        }
      }),
      api.get('/admin/passages'),
    ])
    setQuestions(qRes.data.questions)
    setTotal(qRes.data.total)
    setPassages(pRes.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [filterSubject, filterType, filterTopic, filterExam, filterTagIds, searchQuery, page])

  // Debounce typing so the bank isn't queried on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  // Any change to what's being looked at starts again from page 1 — staying on
  // page 7 of a narrower result set lands on an empty screen.
  useEffect(() => { setPage(1) }, [filterSubject, filterType, filterTopic, filterExam, filterTagIds, searchQuery])

  // ── Open / close / edit helpers ───────────────────────────────────────────
  function openCreateQuestion() {
    setForm(emptyForm); setEditingId(null); setSimilar([]); setError('')
    setShowForm(true); setShowPassageForm(false)
  }
  function closeQuestionForm() {
    setForm(emptyForm); setEditingId(null); setSimilar([]); setShowForm(false)
  }
  function editQuestion(q: Question) {
    setForm({
      questionType: q.questionType,
      exam: q.exam ?? 'SSC_CGL',
      text: q.text,
      imageUrl: q.imageUrl ?? '',
      optionA: q.optionA, optionB: q.optionB, optionC: q.optionC, optionD: q.optionD,
      ...answerKeyFrom(q),
      subject: q.subject,
      topic: q.topic ?? '',
      tagIds: (q.tags ?? []).map(t => t.id),
      difficulty: q.difficulty,
      passageId: q.passageId ?? '',
      solution: q.solution ?? '',
      hi: (() => {
        const t = q.translations?.find(x => x.language === 'HI')
        return {
          text: t?.text ?? '', optionA: t?.optionA ?? '', optionB: t?.optionB ?? '',
          optionC: t?.optionC ?? '', optionD: t?.optionD ?? '', solution: t?.solution ?? '',
        }
      })(),
      statements: q.structuredData?.statements?.length ? q.structuredData.statements : ['', '', ''],
      conclusions: q.structuredData?.conclusions?.length ? q.structuredData.conclusions : ['', '', ''],
    })
    setEditingId(q.id); setError(''); setSimilar([])
    setShowForm(true); setShowPassageForm(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openCreatePassage() {
    setPassageForm(emptyPassageForm); setEditingPassageId(null); setError('')
    setShowPassageForm(true); setShowForm(false)
  }
  function closePassageForm() {
    setPassageForm(emptyPassageForm); setEditingPassageId(null); setShowPassageForm(false)
  }
  function editPassage(p: Passage) {
    setPassageForm({
      title: p.title,
      content: p.content,
      type: p.type,
      headers: p.tableData?.headers ?? [''],
      rows: p.tableData?.rows ?? [['']],
    })
    setEditingPassageId(p.id); setError('')
    setShowPassageForm(true); setShowForm(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveQuestion(e: FormEvent) {
    e.preventDefault()
    // contentEditable has no native `required` — a field counts as filled if it
    // has visible text OR an image.
    const filled = (html: string) => stripHtml(html).length > 0 || /<img/i.test(html || '')
    if (form.questionType !== 'SYLLOGISM' && !filled(form.text)) {
      setActiveLang('EN'); setError('Question text is required.'); return
    }
    // A type-in question has no options to fill in.
    if (form.questionType !== 'TITA'
      && (['A', 'B', 'C', 'D'] as const).some(o => !filled(form[`option${o}` as keyof typeof emptyForm] as string))) {
      setError('All four options are required (text or image).'); return
    }
    const keyError = answerKeyError(form.questionType, form)
    if (keyError) { setError(keyError); return }
    // Caught here rather than left to the server, so the admin lands on the
    // tab holding the wrong fields instead of reading a 400 about them.
    if (hindiStarted && !hindiComplete) {
      setActiveLang('HI')
      setError('The Hindi translation is incomplete — the question and all four options are required. Clear every Hindi field to skip it.')
      return
    }
    // A problem with the English content belongs on the English tab.
    if (activeLang !== 'EN') setActiveLang('EN')
    setSaving(true); setError('')
    try {
      const payload: any = {
        questionType: form.questionType,
        text: form.text,
        imageUrl: form.imageUrl || null,
        exam: form.exam,
        // Blank rather than omitted for a type-in question, so switching a
        // question to that format clears options it will never show again.
        optionA: form.questionType === 'TITA' ? '' : form.optionA,
        optionB: form.questionType === 'TITA' ? '' : form.optionB,
        optionC: form.questionType === 'TITA' ? '' : form.optionC,
        optionD: form.questionType === 'TITA' ? '' : form.optionD,
        ...answerKeyPayload(form.questionType, form),
        subject: form.subject,
        // Only SSC files questions by syllabus topic; CAT uses tags.
        topic: form.exam === 'SSC_CGL' ? (form.topic || null) : null,
        tagIds: form.tagIds,
        difficulty: form.difficulty,
        passageId: (form.questionType === 'PASSAGE' || form.questionType === 'TABLE') && form.passageId
          ? form.passageId : null,
        structuredData: form.questionType === 'SYLLOGISM'
          ? { statements: form.statements.filter(Boolean), conclusions: form.conclusions.filter(Boolean) }
          : null,
        solution: filled(form.solution) ? form.solution : null,
        // Sent even when blank: an empty translation is how the server is told
        // to remove one, so clearing the fields deletes the Hindi version.
        translations: translationsPayload(form.hi),
      }
      if (editingId) await api.put(`/admin/questions/${editingId}`, payload)
      else await api.post('/admin/questions', payload)
      closeQuestionForm(); load()
    } catch (err: any) {
      setError(errMsg(err, 'Failed to save question'))
    } finally { setSaving(false) }
  }

  async function savePassage(e: FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const payload: any = {
        title: passageForm.title,
        content: passageForm.content,
        type: passageForm.type,
        tableData: passageForm.type === 'TABLE'
          ? { headers: passageForm.headers, rows: passageForm.rows }
          : null,
      }
      if (editingPassageId) await api.put(`/admin/passages/${editingPassageId}`, payload)
      else await api.post('/admin/passages', payload)
      closePassageForm(); load()
    } catch (err: any) {
      setError(errMsg(err, 'Failed to save passage'))
    } finally { setSaving(false) }
  }

  async function deleteQuestion(id: string) {
    if (!(await confirm({
      title: 'Delete this question?',
      message: 'It is removed from the bank and from every contest and mock that uses it.',
      confirmLabel: 'Delete question',
      danger: true,
    }))) return
    await api.delete(`/admin/questions/${id}`); load()
  }
  async function deletePassage(id: string) {
    if (!(await confirm({
      title: 'Delete this passage?',
      message: 'Any questions still linked to it will lose their passage.',
      confirmLabel: 'Delete passage',
      danger: true,
    }))) return
    await api.delete(`/admin/passages/${id}`); load()
  }

  const passageMap = Object.fromEntries(passages.map(p => [p.id, p]))

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const rangeFrom = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeTo = Math.min(page * PER_PAGE, total)

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="page-header">
          <h1>Question Bank</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => showPassageForm ? closePassageForm() : openCreatePassage()}>
              {showPassageForm ? 'Cancel' : '+ Passage / Table'}
            </button>
            <button className="btn btn-primary" onClick={() => showForm ? closeQuestionForm() : openCreateQuestion()}>
              {showForm ? 'Cancel' : '+ Add Question'}
            </button>
          </div>
        </div>

        {/* ── Passage form ───────────────────────────────────────────────── */}
        {showPassageForm && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ marginBottom: 16 }}>{editingPassageId ? 'Edit Passage / Table' : 'Add Passage / Table'}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={savePassage}>
              <div className="form-row">
                <div className="form-group">
                  <label>Type</label>
                  <select className="input" value={passageForm.type}
                    onChange={e => setPassageForm(f => ({ ...f, type: e.target.value as any }))}>
                    <option value="TEXT">Reading Passage</option>
                    <option value="TABLE">Data Table</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Title / Description (shown above the passage)</label>
                  <input className="input" value={passageForm.title} placeholder="e.g. Q 66-70 refer to the following table..."
                    onChange={e => setPassageForm(f => ({ ...f, title: e.target.value }))} />
                </div>
              </div>
              {passageForm.type === 'TEXT' ? (
                <div className="form-group">
                  <label>Passage Text</label>
                  <textarea className="input" rows={6} value={passageForm.content}
                    onChange={e => setPassageForm(f => ({ ...f, content: e.target.value }))}
                    required style={{ resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
              ) : (
                <div className="form-group">
                  <label>Table Data</label>
                  <div className="form-group">
                    <label style={{ fontSize: 12 }}>Short description (optional)</label>
                    <input className="input" value={passageForm.content}
                      onChange={e => setPassageForm(f => ({ ...f, content: e.target.value }))}
                      placeholder="e.g. The following table shows total candidates and present candidates..." />
                  </div>
                  <TableBuilder
                    headers={passageForm.headers}
                    rows={passageForm.rows}
                    onChange={(h, r) => setPassageForm(f => ({ ...f, headers: h, rows: r }))}
                  />
                </div>
              )}
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingPassageId ? 'Update Passage' : 'Save Passage'}
              </button>
            </form>
          </div>
        )}

        {/* ── Question form ──────────────────────────────────────────────── */}
        {showForm && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ marginBottom: 16 }}>{editingId ? 'Edit Question' : 'Add Question'}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={saveQuestion}>

              {/* ── Shared ────────────────────────────────────────────
                  Everything that is the same in every language. Kept out
                  of the tabs so it is answered once, not per language —
                  and so a translator cannot accidentally change the
                  correct option or the difficulty. */}
              <div className="q-shared">
                {/* Which examination this question is written for. First,
                    because it decides the sections and the answer formats
                    everything below it offers. */}
                <div className="form-group">
                  <label>Examination</label>
                  {examError && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{examError}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    {(catalogue?.exams ?? []).map(e => (
                      <label key={e.key} style={{
                        border: `2px solid ${form.exam === e.key ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        background: form.exam === e.key ? 'var(--primary-light)' : 'var(--surface)',
                        color: form.exam === e.key ? 'var(--primary)' : 'var(--heading)',
                      }}>
                        <input type="radio" style={{ display: 'none' }} checked={form.exam === e.key}
                          onChange={() => pickExam(e.key)} />
                        {e.label}
                      </label>
                    ))}
                  </div>
                  {editingId && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                      Moving a question to another examination also clears its section and tags,
                      because neither belongs to the new one.
                    </div>
                  )}
                </div>

                {/* Question type selector. Which formats are on offer comes
                    from the exam — SSC has no type-in questions. */}
                <div className="form-group">
                  <label>Question Type</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginTop: 4 }}>
                    {allowedTypes.map(t => (
                      <label key={t} style={{
                        border: `2px solid ${form.questionType === t ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
                        background: form.questionType === t ? 'var(--primary-light)' : 'var(--surface)',
                        transition: 'all .15s',
                      }}>
                        <input type="radio" style={{ display: 'none' }} value={t}
                          checked={form.questionType === t} onChange={() => set('questionType', t)} />
                        <div style={{ fontWeight: 600, fontSize: 13, color: form.questionType === t ? 'var(--primary)' : 'var(--heading)' }}>
                          {TYPE_LABELS[t]}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{TYPE_DESCRIPTIONS[t]}</div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Passage/Table selector */}
                {(form.questionType === 'PASSAGE' || form.questionType === 'TABLE') && (
                  <div className="form-group">
                    <label>Link to Passage / Table</label>
                    {passages.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        No passages yet. Create one first using "+ Passage / Table" above.
                      </p>
                    ) : (
                      <select className="input" value={form.passageId}
                        onChange={e => set('passageId', e.target.value)} required>
                        <option value="">-- Select a passage --</option>
                        {passages
                          .filter(p => form.questionType === 'TABLE' ? p.type === 'TABLE' : p.type === 'TEXT')
                          .map(p => (
                            <option key={p.id} value={p.id}>
                              {p.type === 'TABLE' ? '📊' : '📄'} {p.title || p.content.slice(0, 60)}
                            </option>
                          ))}
                      </select>
                    )}
                    {form.passageId && passageMap[form.passageId] && (
                      <div style={{ marginTop: 8 }}>
                        <PassagePreview passage={passageMap[form.passageId]} />
                      </div>
                    )}
                  </div>
                )}


                {/* Question image (optional) */}
                <div className="form-group">
                  <label>Question Image <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional — diagrams, figures)</span></label>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <label className="btn btn-ghost btn-sm" style={{ cursor: uploading ? 'wait' : 'pointer', margin: 0 }}>
                      {uploading ? 'Uploading…' : form.imageUrl ? '🖼 Replace Image' : '📷 Upload Image'}
                      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp"
                        style={{ display: 'none' }} disabled={uploading}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = '' }} />
                    </label>
                    {form.imageUrl && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <img src={form.imageUrl} alt="Question"
                          style={{ height: 56, borderRadius: 6, border: '1px solid var(--border)' }} />
                        <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                          onClick={() => set('imageUrl', '')}>Remove</button>
                      </div>
                    )}
                  </div>
                </div>



                {/* The answer key, in whichever shape this format needs. */}
                <AnswerKeyEditor
                  type={form.questionType}
                  value={form}
                  onChange={patch => setForm(f => ({ ...f, ...patch }))}
                />

                <div className="form-row">
                  <div className="form-group">
                    <label>Section</label>
                    <select className="input" value={form.subject}
                      onChange={e => {
                        const next = e.target.value as Question['subject']
                        setForm(f => ({
                          ...f,
                          subject: next,
                          // A topic belongs to one subject, so switching
                          // subject drops a tag that no longer applies.
                          topic: topicsFor(next).includes(f.topic) ? f.topic : '',
                        }))
                      }}>
                      {examSections.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Difficulty</label>
                    <select className="input" value={form.difficulty}
                      onChange={e => set('difficulty', e.target.value as any)}>
                      {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                {/* The syllabus topic list only exists for SSC. Everything
                    else is labelled with tags, which are renameable and
                    shared across sections. */}
                {form.exam === 'SSC_CGL' && (
                  <div className="form-group">
                    <label>
                      Topic{' '}
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                        (optional — helps filter the bank and build topic-wise practice later)
                      </span>
                    </label>
                    <select className="input" value={form.topic}
                      onChange={e => set('topic', e.target.value)}>
                      <option value="">— No topic —</option>
                      {topicsFor(form.subject).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                )}

                <TagPicker exam={form.exam} value={form.tagIds}
                  onChange={ids => set('tagIds', ids)} />

              </div>

              {/* The per-language editor, shared with the contest and mock
                  forms. This page carried its own copy until now, which is how
                  a question could gain Hindi fields in one form and not the
                  others — the reason Hindi ended up typed into English fields.
                  Anything gained here now reaches all three. */}
              <QuestionContentTabs
                value={form}
                onChange={patch => setForm(f => ({ ...f, ...patch }))}
                activeLang={activeLang}
                onLangChange={setActiveLang}
                textLabel={
                  <>
                    {form.questionType === 'SYLLOGISM'
                      ? 'Question / Direction Text (appears after statements & conclusions)'
                      : 'Question Text'}
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
                      — use the toolbar for bold, italic, color, x² superscript, x₂ subscript
                    </span>
                  </>
                }
                englishExtras={
                  <>
            {/* Near-duplicate warning */}
            {similar.length > 0 && (
              <div style={{
                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
                padding: '12px 14px', marginBottom: 16,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
                  ⚠ {similar.length} similar question{similar.length !== 1 ? 's' : ''} already in the bank — make sure this isn't a duplicate
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {similar.map(s => (
                    <div key={s.id} style={{ fontSize: 13, color: '#78350f', display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 700, fontSize: 11, background: '#fde68a', color: '#92400e', padding: '1px 6px', borderRadius: 10, flexShrink: 0 }}>
                        {s.score}% match
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Syllogism structured input */}
            {form.questionType === 'SYLLOGISM' && (
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Statements (bold in exam)</div>
                {form.statements.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, minWidth: 20 }}>{i + 1}.</span>
                    <input className="input" style={{ flex: 1 }} value={s}
                      placeholder={`Statement ${i + 1}`}
                      onChange={e => setStatement(i, e.target.value)} />
                    {form.statements.length > 1 && (
                      <button type="button" onClick={() => removeStatement(i)}
                        style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn-sm btn-ghost" onClick={addStatement}>+ Statement</button>

                <div style={{ fontWeight: 600, margin: '16px 0 12px', fontSize: 14 }}>Conclusions (bold in exam)</div>
                {form.conclusions.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, minWidth: 20 }}>
                      {['I.', 'II.', 'III.', 'IV.'][i] ?? `${i + 1}.`}
                    </span>
                    <input className="input" style={{ flex: 1 }} value={c}
                      placeholder={`Conclusion ${i + 1}`}
                      onChange={e => setConclusion(i, e.target.value)} />
                    {form.conclusions.length > 1 && (
                      <button type="button" onClick={() => removeConclusion(i)}
                        style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn-sm btn-ghost" onClick={addConclusion}>+ Conclusion</button>
              </div>
            )}
                  </>
                }
              />

              {/* Sits between the content and the save button on purpose: it
                  is the last thing an author looks at before committing, and
                  a mangled formula or an empty option is obvious here in a
                  way it is not in the fields above. */}
              <div style={{ margin: '18px 0' }}>
                <QuestionPreview
                  value={form}
                  passage={
                    (form.questionType === 'PASSAGE' || form.questionType === 'TABLE') && form.passageId
                      ? passageMap[form.passageId]
                      : null
                  }
                />
              </div>

              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update Question' : 'Save Question'}
              </button>
            </form>
          </div>
        )}

        {/* ── Tabs ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {(['questions', 'passages'] as const).map(t => (
            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
              {t} {t === 'questions' ? `(${total})` : `(${passages.length})`}
            </button>
          ))}
        </div>

        {/* ── Questions list ─────────────────────────────────────────────── */}
        {tab === 'questions' && (
          <div className="card">
            <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <button className={`tab-btn ${filterSubject === '' ? 'active' : ''}`}
                onClick={() => { setFilterSubject(''); setFilterTopic('') }}>
                All sections
              </button>
              {/* The sections on offer follow the exam filter; with no exam
                  chosen, every section of every exam is listed. */}
              {bankSections.map(sec => (
                <button key={sec.key} className={`tab-btn ${filterSubject === sec.key ? 'active' : ''}`}
                  onClick={() => { setFilterSubject(sec.key); setFilterTopic('') }}>
                  {sec.short}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="qb-search">
                <span className="qb-search-icon" aria-hidden="true">🔍</span>
                <input
                  className="input qb-search-input"
                  type="search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search question text or options…"
                  aria-label="Search questions"
                />
                {search && (
                  <button className="qb-search-clear" onClick={() => setSearch('')} title="Clear search">×</button>
                )}
              </div>
              <select className="input" style={{ width: 'auto' }} value={filterExam}
                onChange={e => {
                  // The chosen section may not exist in the new exam, so it
                  // is cleared rather than silently returning nothing.
                  setFilterExam(e.target.value as '' | Exam)
                  setFilterSubject(''); setFilterTopic(''); setFilterTagIds([])
                }}>
                <option value="">All exams</option>
                {(catalogue?.exams ?? []).map(ex => (
                  <option key={ex.key} value={ex.key}>{ex.label}</option>
                ))}
              </select>
              <select className="input" style={{ width: 'auto' }} value={filterType}
                onChange={e => setFilterType(e.target.value)}>
                <option value="">All types</option>
                {bankTypes.map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
              {filterSubject && topicsFor(filterSubject).length > 0 && (
                <select className="input" style={{ width: 'auto' }} value={filterTopic}
                  onChange={e => setFilterTopic(e.target.value)}>
                  <option value="">All topics</option>
                  <option value="__none">— Untagged —</option>
                  {topicsFor(filterSubject).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              )}
              {filterTagIds.length > 0 && (
                <button className="btn btn-sm btn-ghost" onClick={() => setFilterTagIds([])}>
                  Clear {filterTagIds.length} tag {filterTagIds.length === 1 ? 'filter' : 'filters'}
                </button>
              )}
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {total} {total === 1 ? 'question' : 'questions'}
                {searchQuery && <> matching “{searchQuery}”</>}
              </span>
            </div>

            {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
            {!loading && questions.length === 0 && (
              <p className="empty">
                {searchQuery
                  ? `No questions match “${searchQuery}”.`
                  : filterSubject ? `No ${SUBJECT_LABELS[filterSubject]} questions yet.` : 'No questions yet.'}
              </p>
            )}
            {questions.length > 0 && (
              <table>
                <thead>
                  <tr><th>#</th><th>Question</th><th>Type</th><th>Subject</th><th>Topic</th><th>Diff</th><th>Ans</th><th>Languages</th><th></th></tr>
                </thead>
                <tbody>
                  {questions.map((q, i) => (
                    <tr key={q.id}>
                      <td style={{ color: 'var(--text-muted)', width: 36 }}>{i + 1}</td>
                      <td style={{ maxWidth: 380 }}>
                        {q.passage && (
                          <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, marginBottom: 4 }}>
                            {q.passage.type === 'TABLE' ? '📊' : '📄'} {q.passage.title || 'Passage'}
                          </div>
                        )}
                        {q.questionType === 'SYLLOGISM' && q.structuredData && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                            <strong>Statements:</strong> {q.structuredData.statements.slice(0, 2).join(' / ')}
                          </div>
                        )}
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>
                          {(stripHtml(q.text) || /<img/i.test(q.text))
                            ? <RichText as="span" html={q.text} />
                            : <em style={{ color: 'var(--text-muted)' }}>(syllogism question)</em>}
                        </div>
                        {q.questionType !== 'TITA' && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            A: <RichText html={q.optionA} /> · B: <RichText html={q.optionB} /> · C: <RichText html={q.optionC} /> · D: <RichText html={q.optionD} />
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
                          background: q.questionType === 'STANDARD' ? 'var(--bg)' :
                            q.questionType === 'SYLLOGISM' ? '#ede9fe' :
                            q.questionType === 'PASSAGE' ? '#dbeafe' : '#dcfce7',
                          color: q.questionType === 'STANDARD' ? 'var(--text-muted)' :
                            q.questionType === 'SYLLOGISM' ? '#7c3aed' :
                            q.questionType === 'PASSAGE' ? '#2563eb' : '#16a34a',
                        }}>{TYPE_LABELS[q.questionType]}</span>
                        {/* Only worth the row's width once a second exam
                            exists — before that every question is SSC. */}
                        {(catalogue?.exams.length ?? 0) > 1 && (
                          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3, fontWeight: 600 }}>
                            {specOf(catalogue, q.exam ?? 'SSC_CGL')?.label ?? q.exam}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>{SUBJECT_LABELS[q.subject] ?? q.subject}</td>
                      <td style={{ fontSize: 12.5, color: q.topic ? 'var(--heading)' : 'var(--text-muted)' }}>
                        {q.topic || (q.tags?.length ? '' : '—')}
                        {/* Clicking a tag narrows the bank to it, which is
                            the quickest way to find the rest of a set. */}
                        {q.tags && q.tags.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: q.topic ? 4 : 0 }}>
                            {q.tags.map(t => (
                              <button key={t.id} type="button" title={`Filter by ${t.name}`}
                                onClick={() => setFilterTagIds(ids => ids.includes(t.id) ? ids : [...ids, t.id])}
                                style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer' }}>
                                <TagChip tag={t} />
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td><span className={`badge badge-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span></td>
                      <td style={{ fontWeight: 700, color: 'var(--success)', fontSize: 12.5 }}>{answerLabel(q)}</td>
                      {/* At a glance: which languages this question exists in,
                          so untranslated ones are easy to pick out. */}
                      <td>
                        <span className="lang-chips">
                          {LANGUAGES.map(l => {
                            const has = (q.languages ?? ['EN']).includes(l.code)
                            return (
                              <span key={l.code}
                                className={`lang-chip ${has ? 'lang-chip-on' : 'lang-chip-off'}`}
                                title={`${l.label}: ${has ? 'available' : 'not available'}`}>
                                {has ? '✓' : '✗'} {l.code}
                              </span>
                            )
                          })}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => editQuestion(q)}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => deleteQuestion(q.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {totalPages > 1 && (
              <div className="qb-pagination">
                <button className="btn btn-ghost btn-sm" disabled={page <= 1 || loading}
                  onClick={() => setPage(1)}>« First</button>
                <button className="btn btn-ghost btn-sm" disabled={page <= 1 || loading}
                  onClick={() => setPage(p => p - 1)}>← Previous</button>
                <span className="qb-page-label">
                  Page <strong>{page}</strong> of {totalPages}
                  <span className="qb-page-range"> · showing {rangeFrom}–{rangeTo} of {total}</span>
                </span>
                <button className="btn btn-ghost btn-sm" disabled={page >= totalPages || loading}
                  onClick={() => setPage(p => p + 1)}>Next →</button>
                <button className="btn btn-ghost btn-sm" disabled={page >= totalPages || loading}
                  onClick={() => setPage(totalPages)}>Last »</button>
              </div>
            )}
          </div>
        )}

        {/* ── Passages list ─────────────────────────────────────────────── */}
        {tab === 'passages' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
            {!loading && passages.length === 0 && (
              <div className="card"><p className="empty">No passages yet. Click "+ Passage / Table" to add one.</p></div>
            )}
            {passages.map(p => (
              <div key={p.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, marginRight: 8,
                      background: p.type === 'TABLE' ? '#dcfce7' : '#dbeafe',
                      color: p.type === 'TABLE' ? '#16a34a' : '#2563eb',
                    }}>{p.type === 'TABLE' ? '📊 Table' : '📄 Passage'}</span>
                    <span style={{ fontWeight: 600 }}>{p.title || '(untitled)'}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                      {questions.filter(q => q.passageId === p.id).length} questions linked
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => editPassage(p)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => deletePassage(p.id)}>Delete</button>
                  </div>
                </div>
                <PassagePreview passage={p} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
