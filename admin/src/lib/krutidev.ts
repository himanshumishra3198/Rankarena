/**
 * Kruti Dev → Unicode Devanagari.
 *
 * Kruti Dev is a legacy *encoding*, not a font in the usual sense: क is stored
 * as the ASCII byte `d`, and only the Kruti Dev font makes it look Devanagari.
 * Text pasted from such a document is therefore Latin gibberish everywhere
 * else — search, copy-paste, screen readers and any device without the font.
 *
 * Converting once, on entry, means everything downstream stores and renders
 * real Unicode. The exam room needs no font, no special handling, and no
 * knowledge that Kruti Dev exists.
 *
 * Two things make this more than a character swap:
 *
 *  - The short-i matra is typed *before* its consonant in Kruti Dev (`f` then
 *    the consonant) but written *after* it in Unicode, so it has to be moved
 *    across the whole consonant cluster — `fu` is न + ि, which must become नि.
 *  - Several glyphs are multi-character sequences that must be matched before
 *    their prefixes, or `Ø` would be read as two separate letters.
 */

// Longest-first: order matters, and the sort below enforces it regardless.
const MAP: Record<string, string> = {
  // conjuncts and multi-character glyphs
  'Ø': 'क्र', 'ƒ': 'ऋ', '˜': 'ॉ', 'æ': 'क्ष', 'Ì': 'ज्ञ',
  'â': 'र्', 'ð': 'ट्र', 'ñ': 'ड्र', 'ò': 'द्र', 'ó': 'प्र', 'ô': 'श्र',
  'õ': 'ह्र', 'Ú': 'त्र', 'Û': 'त्त', 'Ü': 'द्द', 'Ý': 'द्ध',
  'Þ': 'द्व', 'ß': 'श्व', 'à': 'ह्न', 'á': 'ह्म',
  '{k': 'क्ष', 'K': 'ज्ञ', '"k': 'ष', '‘k': 'श', 'Nk': 'छ',
  // vowels
  'v': 'अ', 'vk': 'आ', 'b': 'इ', 'bZ': 'ई', 'm': 'उ', 'Å': 'ऊ',
  ',': 'ए', ',s': 'ऐ', 'vks': 'ओ', 'vkS': 'औ', 'v¡': 'अँ',
  // consonants
  'd': 'क', '[k': 'ख', 'x': 'ग', '?k': 'घ', 'Ä': 'ङ',
  'p': 'च', 'N': 'छ', 't': 'ज', '>': 'झ', '¥': 'ञ',
  'V': 'ट', 'B': 'ठ', 'M': 'ड', '<': 'ढ', '.k': 'ण',
  'r': 'त', 'Fk': 'थ', 'n': 'द', '/k': 'ध', 'u': 'न',
  'i': 'प', 'Q': 'फ', 'c': 'ब', 'Hk': 'भ', 'e': 'म',
  ';': 'य', 'j': 'र', 'y': 'ल', 'o': 'व',
  'l': 'स', 'g': 'ह', '‘': 'श', 'k': 'ा',
  // matras and marks
  'f': 'ि', 'h': 'ी', 'q': 'ु', 'w': 'ू', 's': 'े', 'S': 'ै',
  'ks': 'ो', 'kS': 'ौ', 'origin': '', '`': 'ृ', '~': '्',
  'a': 'ं', 'W': 'ँ', '%': 'ः', 'A': '।', '&': '-', 'µ': '॰',
  'Ù': 'ड़', 'M+': 'ड़', '<+': 'ढ़', 'Q+': 'फ़', 'т': 'ज़',
  // Half-consonants. Kruti Dev's rule is that `Xk` is the full letter and `X`
  // alone is its half form, so every full consonant above has a partner here.
  'D': 'क्', 'X': 'ग्', 'P': 'च्', 'T': 'ज्', 'R': 'त्', 'F': 'थ्',
  'E': 'म्', 'Y': 'ल्', 'O': 'व्', 'L': 'स्', 'H': 'भ्', 'G': 'ह्',
  '?': 'घ्', '/': 'ध्', '.': 'ण्', '[': 'ख्', 'C': 'ब्', 'J': 'र्',
  'I': 'प्', '\\': 'श्',
  // digits
  '0': '०', '1': '१', '2': '२', '3': '३', '4': '४',
  '5': '५', '6': '६', '7': '७', '8': '८', '9': '९',
}

const KEYS = Object.keys(MAP).sort((a, b) => b.length - a.length)

// A consonant, optionally followed by halant-joined consonants — the unit the
// short-i matra has to jump over.
const CLUSTER = /([क-हक़-य़](?:्[क-हक़-य़])*)/

/**
 * Heuristic: does this look like Kruti Dev rather than English or Unicode
 * Hindi? Used to offer conversion rather than to perform it silently — a false
 * positive that rewrites a genuine English question would be far worse than a
 * button the admin has to press.
 */
export function looksLikeKrutiDev(text: string): boolean {
  const plain = text.replace(/<[^>]*>/g, '').trim()
  if (!plain) return false
  // Real Devanagari already — nothing to convert.
  if (/[ऀ-ॿ]/.test(plain)) return false
  // Kruti Dev leans heavily on these; ordinary English text does not.
  const markers = (plain.match(/[;\[\]{}<>\\^`~¡¢£¤¥§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]/g) || []).length
  return markers / plain.length > 0.08
}

/** Converts a Kruti Dev string to Unicode Devanagari. */
export function krutiDevToUnicode(input: string): string {
  if (!input) return input

  let out = ''
  let i = 0
  while (i < input.length) {
    const key = KEYS.find(k => k && input.startsWith(k, i))
    if (key) { out += MAP[key]; i += key.length } else { out += input[i]; i += 1 }
  }

  // Move the short-i matra after its cluster: Kruti Dev types it first.
  out = out.replace(new RegExp('ि' + CLUSTER.source, 'g'), '$1ि')

  // Reph: र् typed before the cluster belongs after it as a superscript mark.
  out = out.replace(new RegExp('र्' + CLUSTER.source, 'g'), '$1र्')

  return out
}

/** Converts while leaving any HTML tags untouched. */
export function convertHtml(html: string): string {
  return html.replace(/>([^<]+)</g, (_m, text) => '>' + krutiDevToUnicode(text) + '<')
             .replace(/^([^<]+)/, (m) => krutiDevToUnicode(m))
             .replace(/([^>]+)$/, (m) => (m.includes('<') ? m : krutiDevToUnicode(m)))
}
