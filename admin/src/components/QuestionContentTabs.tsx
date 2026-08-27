import { useState, type ReactNode } from 'react'
import { RichEditor } from './RichEditor'
import { stripHtml } from './RichText'
import { LANGUAGES, type Language } from '../lib/types'
import { convertHtml, looksLikeKrutiDev } from '../lib/krutidev'

/**
 * The per-language half of a question: text, four options, solution.
 *
 * Shared by every place a question can be written — the question bank, and the
 * inline forms inside a contest and a mock test. Those three had drifted into
 * separate copies, and only one of them ever gained Hindi fields, which is why
 * Hindi ended up typed into English fields: from the other two there was
 * nowhere else to put it.
 *
 * Everything language-independent — type, subject, difficulty, correct option —
 * stays with the host form. It is not per-language, and keeping it out means a
 * translator cannot reach it.
 */

export interface QuestionContentValue {
  text: string
  optionA: string; optionB: string; optionC: string; optionD: string
  solution: string
  hi: {
    text: string
    optionA: string; optionB: string; optionC: string; optionD: string
    solution: string
  }
}

export const EMPTY_HI: QuestionContentValue['hi'] = {
  text: '', optionA: '', optionB: '', optionC: '', optionD: '', solution: '',
}

/** True once any Hindi field has content. */
export function hindiStartedOf(hi: QuestionContentValue['hi']) {
  return [hi.text, hi.optionA, hi.optionB, hi.optionC, hi.optionD].some(v => stripHtml(v).trim())
}

/** True when the question and all four options are present. */
export function hindiCompleteOf(hi: QuestionContentValue['hi']) {
  return [hi.text, hi.optionA, hi.optionB, hi.optionC, hi.optionD].every(v => stripHtml(v).trim())
}

/** Shapes the value for the API. Blank means "no translation" — and on an edit, "remove it". */
export function translationsPayload(hi: QuestionContentValue['hi']) {
  return {
    HI: {
      text: hi.text.trim(),
      optionA: hi.optionA.trim(), optionB: hi.optionB.trim(),
      optionC: hi.optionC.trim(), optionD: hi.optionD.trim(),
      solution: hi.solution.trim() || null,
    },
  }
}

export default function QuestionContentTabs({
  value, onChange, englishExtras, textLabel, activeLang, onLangChange,
}: {
  value: QuestionContentValue
  onChange: (patch: Partial<QuestionContentValue>) => void
  /** Rendered inside the English tab — syllogism inputs, duplicate warnings. */
  englishExtras?: ReactNode
  textLabel?: ReactNode
  /** Optional external control, so a host can jump to the failing tab. */
  activeLang?: Language
  onLangChange?: (l: Language) => void
}) {
  const [internal, setInternal] = useState<Language>('EN')
  const lang = activeLang ?? internal
  const setLang = onLangChange ?? setInternal

  const started = hindiStartedOf(value.hi)
  const complete = hindiCompleteOf(value.hi)
  const patchHi = (p: Partial<QuestionContentValue['hi']>) => onChange({ hi: { ...value.hi, ...p } })

  // Offered, never automatic. Detection is a heuristic, and silently rewriting
  // a genuine English question would be far worse than a button not pressed.
  const kdFields = ['text', 'optionA', 'optionB', 'optionC', 'optionD', 'solution'] as const
  const kdDetected = kdFields.some(f => looksLikeKrutiDev(value.hi[f]))
  function convertKrutiDev() {
    const patch: Partial<QuestionContentValue['hi']> = {}
    for (const f of kdFields) if (value.hi[f]) patch[f] = convertHtml(value.hi[f])
    patchHi(patch)
  }

  return (
    <>
      <div className="q-lang-tabs" role="tablist">
        {LANGUAGES.map(l => {
          const state = l.code !== 'HI' ? 'on' : complete ? 'on' : started ? 'partial' : 'off'
          return (
            <button key={l.code} type="button" role="tab"
              aria-selected={lang === l.code}
              className={`q-lang-tab ${lang === l.code ? 'active' : ''}`}
              onClick={() => setLang(l.code)}>
              <span>{l.native}</span>
              <span className={`lang-chip lang-chip-${state}`}>
                {state === 'on' ? '✓' : state === 'partial' ? '◐' : '✗'}
              </span>
            </button>
          )
        })}
      </div>

      {/* Keyed on the language: TipTap reads its placeholder once at
          construction, so a reused editor shows the other language's prompt.
          Content is unaffected — it comes from the host's state. */}
      <div className="q-lang-panel" key={lang}>
        {lang === 'EN' ? (
          <>
            {englishExtras}
            <div className="form-group">
              <label>{textLabel ?? 'Question Text'}</label>
              <RichEditor value={value.text} minHeight={70}
                onChange={v => onChange({ text: v })}
                placeholder="Type the question…" />
            </div>
            <div className="form-row">
              {(['A', 'B', 'C', 'D'] as const).map(opt => (
                <div className="form-group" key={opt}>
                  <label>Option {opt}</label>
                  <RichEditor minHeight={40}
                    value={value[`option${opt}` as 'optionA']}
                    onChange={v => onChange({ [`option${opt}`]: v } as Partial<QuestionContentValue>)}
                    placeholder={`Option ${opt}…`} />
                </div>
              ))}
            </div>
            <div className="form-group">
              <label>Detailed Solution <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <RichEditor value={value.solution} minHeight={90}
                onChange={v => onChange({ solution: v })}
                placeholder="Explain the approach and steps…" />
            </div>
          </>
        ) : (
          <>
            {kdDetected && (
              <div className="kd-banner">
                <span aria-hidden="true">⚠️</span>
                <div>
                  <strong>This looks like Kruti Dev text.</strong> It is stored as Latin
                  characters and will not display as Hindi anywhere. Convert it to Unicode
                  so it renders on every device, and stays searchable and copyable.
                </div>
                <button type="button" className="btn btn-sm btn-primary" onClick={convertKrutiDev}>
                  Convert to Unicode
                </button>
              </div>
            )}
            <p className="q-lang-note">
              Optional. Leave every field blank to skip — Hindi candidates then see the
              English version with a note explaining why. Fill it in and the question and
              all four options are required, so nobody sees a half-translated question.
            </p>
            <div className="form-group">
              <label>प्रश्न — Question text</label>
              <RichEditor value={value.hi.text} minHeight={70}
                onChange={v => patchHi({ text: v })}
                placeholder="प्रश्न हिंदी में लिखें…" />
            </div>
            <div className="form-row">
              {(['A', 'B', 'C', 'D'] as const).map(opt => (
                <div className="form-group" key={opt}>
                  <label>विकल्प {opt} — Option {opt}</label>
                  <RichEditor minHeight={40}
                    value={value.hi[`option${opt}` as 'optionA']}
                    onChange={v => patchHi({ [`option${opt}`]: v })}
                    placeholder={`विकल्प ${opt}…`} />
                </div>
              ))}
            </div>
            <div className="form-group">
              <label>समाधान — Detailed solution <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <RichEditor value={value.hi.solution} minHeight={90}
                onChange={v => patchHi({ solution: v })}
                placeholder="हल हिंदी में…" />
            </div>
          </>
        )}
      </div>
    </>
  )
}
