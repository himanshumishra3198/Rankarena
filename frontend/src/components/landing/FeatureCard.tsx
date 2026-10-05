import type { ReactNode } from 'react'

export default function FeatureCard({
  icon, title, children, accent,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
  /** Tints the icon chip and the hover edge so the four cards read apart. */
  accent: string
}) {
  return (
    <article className="lp-feature" style={{ ['--accent' as string]: accent }}>
      <span className="lp-feature-icon" aria-hidden="true">{icon}</span>
      <h3 className="lp-feature-title">{title}</h3>
      <p className="lp-feature-body">{children}</p>
    </article>
  )
}
