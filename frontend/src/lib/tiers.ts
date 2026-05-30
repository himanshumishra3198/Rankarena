export const TIERS = [
  { min: 0,    max: 1200, label: 'Newbie',           bg: '#cfd3d7', fg: '#808080' },
  { min: 1200, max: 1400, label: 'Pupil',            bg: '#77ff77', fg: '#008000' },
  { min: 1400, max: 1600, label: 'Specialist',       bg: '#77ddbb', fg: '#03a89e' },
  { min: 1600, max: 1900, label: 'Expert',           bg: '#aaaaff', fg: '#0000ff' },
  { min: 1900, max: 2100, label: 'Candidate Master', bg: '#ff88ff', fg: '#aa00aa' },
  { min: 2100, max: 2300, label: 'Master',           bg: '#ffbb55', fg: '#ff8c00' },
  { min: 2300, max: 9999, label: 'Grandmaster',      bg: '#ff7777', fg: '#ff0000' },
]

export function getTier(rating: number) {
  return TIERS.find(t => rating >= t.min && rating < t.max) ?? TIERS[TIERS.length - 1]
}
