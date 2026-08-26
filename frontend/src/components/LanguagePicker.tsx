import { LANGUAGES, type Language } from '../lib/language'

/**
 * Choose the language a paper will be presented in.
 *
 * Shown on the instructions screen, before the clock starts, because the
 * choice is fixed for the attempt — switching mid-exam would mean re-reading
 * questions already answered.
 */
export default function LanguagePicker({
  value, onChange, disabled,
}: {
  value: Language
  onChange: (l: Language) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="lang-picker" disabled={disabled}>
      <legend className="lang-picker-legend">Choose language</legend>
      <div className="lang-picker-options">
        {LANGUAGES.map(l => (
          <label
            key={l.code}
            className={`lang-option ${value === l.code ? 'lang-option-active' : ''}`}
          >
            <input
              type="radio"
              name="paper-language"
              value={l.code}
              checked={value === l.code}
              onChange={() => onChange(l.code)}
            />
            <span className="lang-option-flag" aria-hidden="true">{l.flag}</span>
            <span className="lang-option-native">{l.native}</span>
            {l.native !== l.label && <span className="lang-option-label">{l.label}</span>}
          </label>
        ))}
      </div>
      <p className="lang-picker-note">
        This applies to the questions, options and explanations. It cannot be
        changed once the paper starts.
      </p>
    </fieldset>
  )
}
