/**
 * RankArenas logo: a mark plus wordmark.
 *
 * The mark is three ascending bars inside a rounded badge — a podium read from
 * the side, which says "ranking" at a glance and stays legible down to favicon
 * size. It's drawn in two flat colours with no gradients or filters so it
 * renders identically in light and dark mode and stays crisp at 16px.
 *
 * Kept as inline SVG rather than an image file so it inherits the current
 * colour and needs no extra network request.
 */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="RankArenas"
    >
      <rect width="32" height="32" rx="9" className="logo-badge" />
      {/* Podium bars, shortest to tallest. */}
      <rect x="7"  y="18" width="5" height="8"  rx="1.6" className="logo-bar" />
      <rect x="13.5" y="12" width="5" height="14" rx="1.6" className="logo-bar" />
      <rect x="20" y="6"  width="5" height="20" rx="1.6" className="logo-bar" />
    </svg>
  )
}

export default function Logo({ size = 26, wordmark = true }: {
  size?: number
  wordmark?: boolean
}) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      {wordmark && (
        <span className="logo-word">
          Rank<span>Arenas</span>
        </span>
      )}
    </span>
  )
}
