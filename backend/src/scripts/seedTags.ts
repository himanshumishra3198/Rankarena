import prisma from "../lib/prisma";
import { ensureTags, type TagInput } from "../lib/tags";

/**
 * Seeds the tag vocabulary.
 *
 * Idempotent: tags are matched by slug within a category, so running this
 * twice adds nothing and running it after an admin has renamed a tag by hand
 * does not undo the rename. Safe to re-run after a deploy.
 *
 * Only CAT's syllabus is seeded as tags. SSC questions keep their existing
 * `topic` string — see src/lib/tags.ts for why that is left alone — so the
 * two schemes coexist rather than one being rewritten into the other.
 *
 *   npm run db:seed-tags
 */

const CAT_TOPICS: Record<string, string[]> = {
  VARC: [
    "Reading Comprehension",
    "Para Jumbles",
    "Para Summary",
    "Odd Sentence Out",
    "Sentence Completion",
    "Critical Reasoning",
  ],
  DILR: [
    "Tables",
    "Bar & Line Graphs",
    "Pie Charts",
    "Caselets",
    "Games & Tournaments",
    "Seating Arrangement",
    "Binary Logic",
    "Venn Diagrams",
    "Grid Puzzles",
    "Data Sufficiency",
    "Routes & Networks",
  ],
  QA: [
    "Arithmetic",
    "Algebra",
    "Geometry & Mensuration",
    "Number System",
    "Modern Maths",
  ],
};

const CAT_SUBTOPICS: string[] = [
  // Arithmetic
  "Percentages", "Profit, Loss & Discount", "Simple & Compound Interest",
  "Ratio & Proportion", "Time, Speed & Distance", "Time & Work",
  "Averages, Mixtures & Alligation",
  // Algebra
  "Linear Equations", "Quadratic Equations", "Inequalities",
  "Functions & Graphs", "Logarithms", "Progressions",
  // Geometry
  "Triangles", "Circles", "Quadrilaterals & Polygons",
  "Coordinate Geometry", "Solid Geometry", "Trigonometry",
  // Number system
  "Factors & Multiples", "Remainders", "Base Systems", "Surds & Indices",
  // Modern maths
  "Permutation & Combination", "Probability", "Set Theory",
];

/** Cross-exam, so these carry no exam of their own. */
const SKILLS: string[] = [
  "Calculation Speed",
  "Approximation",
  "Inference",
  "Elimination",
  "Data Extraction",
  "Visualisation",
  "Formula Recall",
];

const DIFFICULTY_BANDS: string[] = ["Sitter", "Moderate", "Tough", "Exam-level"];

async function main() {
  const inputs: TagInput[] = [];

  for (const topics of Object.values(CAT_TOPICS)) {
    for (const name of topics) inputs.push({ name, category: "TOPIC", exam: "CAT" });
  }
  for (const name of CAT_SUBTOPICS) {
    inputs.push({ name, category: "SUBTOPIC", exam: "CAT" });
  }
  for (const name of SKILLS) inputs.push({ name, category: "SKILL", exam: null });
  for (const name of DIFFICULTY_BANDS) inputs.push({ name, category: "DIFFICULTY", exam: null });

  const before = await prisma.tag.count();
  const ids = await ensureTags(inputs);
  const after = await prisma.tag.count();

  console.log(
    `Tags: ${inputs.length} requested, ${ids.length} resolved, ${after - before} created, ${after} total.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
