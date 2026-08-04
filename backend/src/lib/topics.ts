// Canonical topic list per subject, following the SSC syllabus (CGL, CHSL,
// MTS, CPO, GD).
//
// Stored on questions.topic as plain text rather than a Prisma enum, so this
// list can be edited without a database migration. The trade-off is that the
// database won't enforce it, so every write path validates against this map.
//
// Renaming an entry does NOT rewrite existing rows: questions keep the old
// string and will read as untagged in the new dropdown. Add freely; rename
// only with a backfill.

export const SUBJECTS = ["QUANT", "REASONING", "ENGLISH", "GK"] as const;
export type Subject = (typeof SUBJECTS)[number];

export const TOPICS_BY_SUBJECT: Record<Subject, string[]> = {
  QUANT: [
    "Number System & Simplification",
    "Percentage",
    "Profit, Loss & Discount",
    "Ratio, Proportion & Partnership",
    "Average & Mixture",
    "Time, Speed & Distance",
    "Time & Work, Pipes & Cisterns",
    "Simple & Compound Interest",
    "Algebra",
    "Geometry & Mensuration",
    "Trigonometry & Height and Distance",
    "Data Interpretation",
  ],
  REASONING: [
    "Analogy",
    "Classification (Odd One Out)",
    "Series (Number & Alphabet)",
    "Coding-Decoding",
    "Blood Relations",
    "Direction & Distance",
    "Order & Ranking",
    "Seating Arrangement & Puzzles",
    "Syllogism & Statement-Conclusion",
    "Venn Diagram",
    "Mathematical Operations",
    "Non-Verbal Reasoning",
  ],
  ENGLISH: [
    "Reading Comprehension",
    "Cloze Test",
    "Para Jumbles",
    "Spotting Errors",
    "Sentence Improvement",
    "Fill in the Blanks",
    "Synonyms & Antonyms",
    "Idioms & Phrases",
    "One Word Substitution",
    "Spelling Correction",
    "Active & Passive Voice",
    "Direct & Indirect Speech",
  ],
  GK: [
    "Indian History",
    "Indian Polity & Constitution",
    "Geography (India & World)",
    "Indian Economy",
    "General Science — Physics",
    "General Science — Chemistry",
    "General Science — Biology",
    "Current Affairs",
    "Static GK (Books, Awards, Days)",
    "Art & Culture",
    "Sports",
    "Computer & Technology",
  ],
};

/** Every topic across all subjects, for filters that aren't subject-scoped. */
export const ALL_TOPICS: string[] = Object.values(TOPICS_BY_SUBJECT).flat();

/**
 * A topic is valid when it belongs to its question's subject. Null and empty
 * both mean "untagged", which is always allowed — tagging is optional.
 */
export function isValidTopic(subject: string, topic: string | null | undefined): boolean {
  if (topic === null || topic === undefined || topic === "") return true;
  const list = TOPICS_BY_SUBJECT[subject as Subject];
  return Array.isArray(list) && list.includes(topic);
}
