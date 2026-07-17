// A segmented radio picker: shows every choice as a button so the admin
// must consciously pick one (no silently-preselected dropdown value).
export function SegmentedRadio<T extends string>({ value, options, onChange, columns }: {
  value: T | ''
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  columns?: number
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns ?? options.length}, 1fr)`, gap: 8, marginTop: 4 }}>
      {options.map(o => {
        const active = value === o.value
        return (
          <label key={o.value} style={{
            border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 8, padding: '8px 10px', cursor: 'pointer', textAlign: 'center',
            background: active ? 'var(--primary-light)' : 'var(--surface)',
            fontSize: 13, fontWeight: 600,
            color: active ? 'var(--primary)' : 'var(--heading)',
          }}>
            <input type="radio" style={{ display: 'none' }} checked={active} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        )
      })}
    </div>
  )
}
