/**
 * The language a paper is presented in.
 *
 * Kept as a list rather than a union of two so adding a language is a new
 * entry here plus translations in the admin panel — no component knows that
 * "Hindi" exists specifically.
 */
export type Language = 'EN' | 'HI'

export const LANGUAGES: { code: Language; label: string; native: string; flag: string }[] = [
  { code: 'EN', label: 'English', native: 'English', flag: '🇬🇧' },
  { code: 'HI', label: 'Hindi', native: 'हिंदी', flag: '🇮🇳' },
]

export const DEFAULT_LANGUAGE: Language = 'EN'

export function languageLabel(code: Language | string | undefined): string {
  return LANGUAGES.find(l => l.code === code)?.native ?? 'English'
}

/**
 * Last language the user picked, so the choice carries between papers instead
 * of defaulting back to English every time. It is only a starting value — the
 * attempt's own language is what the server records and replays.
 */
const KEY = 'preferred-language'

export function getPreferredLanguage(): Language {
  const v = localStorage.getItem(KEY)
  return LANGUAGES.some(l => l.code === v) ? (v as Language) : DEFAULT_LANGUAGE
}

export function setPreferredLanguage(code: Language) {
  localStorage.setItem(KEY, code)
}
