import { useEffect, useState } from 'react'
import api from './api'
import type { Exam, QuestionType, Section, TagCategory } from './types'

/**
 * What the panel knows about each examination, fetched rather than hard-coded.
 *
 * The sections an exam has, the answer formats it allows and the defaults for
 * a new paper all live in the backend's src/lib/exams.ts. Duplicating them
 * here is how the panel comes to offer a section the API will reject, so the
 * panel asks instead. One small request, cached for the session.
 */

export interface SectionSpec {
  key: Section
  label: string
  short: string
}

export interface ExamSpec {
  key: Exam
  label: string
  sections: SectionSpec[]
  questionTypes: QuestionType[]
  defaults: {
    marks: number
    negativeMarks: number
    durationMinutes: number
    sectionLimits: Partial<Record<Section, number>>
  }
  /** Formats this exam does not penalise — shown next to the marking fields. */
  noPenaltyTypes: QuestionType[]
}

export interface ExamCatalogue {
  exams: ExamSpec[]
  defaultExam: Exam
  tagCategories: TagCategory[]
}

// Module-level, so moving between the question bank and a paper does not
// refetch. Nothing here changes without a deploy.
let cache: ExamCatalogue | null = null
let inFlight: Promise<ExamCatalogue> | null = null

export function loadExams(): Promise<ExamCatalogue> {
  if (cache) return Promise.resolve(cache)
  if (!inFlight) {
    inFlight = api.get<ExamCatalogue>('/admin/exams')
      .then(r => { cache = r.data; return r.data })
      .finally(() => { inFlight = null })
  }
  return inFlight
}

/**
 * The catalogue, or null while it is loading.
 *
 * Null rather than a hard-coded stand-in: a form that guessed the sections
 * and guessed wrong would offer choices the API refuses, which reads as the
 * panel being broken rather than as still loading.
 */
export function useExams() {
  const [catalogue, setCatalogue] = useState<ExamCatalogue | null>(cache)
  const [error, setError] = useState('')

  useEffect(() => {
    if (cache) { setCatalogue(cache); return }
    let live = true
    loadExams()
      .then(c => { if (live) setCatalogue(c) })
      .catch(() => { if (live) setError('Could not load the examination list.') })
    return () => { live = false }
  }, [])

  return { catalogue, error }
}

export function specOf(catalogue: ExamCatalogue | null, exam: Exam): ExamSpec | null {
  return catalogue?.exams.find(e => e.key === exam) ?? null
}

export function sectionsOf(catalogue: ExamCatalogue | null, exam: Exam): SectionSpec[] {
  return specOf(catalogue, exam)?.sections ?? []
}
