import { LANGUAGES, type Language } from '../lib/language'

/**
 * Switch the review between languages.
 *
 * Only on result pages, never in the exam room: mid-paper the choice is fixed,
 * because re-reading a question you have already answered in another language
 * is a way to lose your place. Afterwards none of it affects scoring, so
 * reading a question in one language and its solution in the other is just
 * useful — which is how most exam platforms behave.
 */
export default function LanguageToggle({
  value, onChange, busy,
}: {
  value: Language
  onChange: (l: Language) => void
  busy?: boolean
}) {
  return (
    <div className="lang-toggle" role="group" aria-label="Question language">
      {LANGUAGES.map(l => (
        <button
          key={l.code}
          type="button"
          className={`lang-toggle-btn ${value === l.code ? 'active' : ''}`}
          aria-pressed={value === l.code}
          disabled={busy}
          onClick={() => value !== l.code && onChange(l.code)}
        >
          {l.native}
        </button>
      ))}
    </div>
  )
}
