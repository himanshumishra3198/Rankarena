import prisma from "./prisma";
import type { Exam, TagCategory } from "./../generated/prisma/enums";

/**
 * Reusable labels for questions.
 *
 * Replaces the free-text `questions.topic` for every exam added after SSC
 * CGL. A topic used to be a string checked against a hard-coded list, which
 * made renaming one a data migration and let "Time & Work" and
 * "Time and Work" exist as different topics. A tag is a row with a slug, so
 * it is renamed in one place and matched by identity.
 *
 * `topic` itself is left alone on existing SSC questions. Rewriting a
 * hundred thousand rows to prove a point about normalisation would risk the
 * filters, the profile breakdown and the practice problemset for no visible
 * gain; new exams simply use tags from the start, and SSC can be backfilled
 * later by a job rather than by a migration.
 */

export const TAG_CATEGORIES: TagCategory[] = [
  "TOPIC", "SUBTOPIC", "DIFFICULTY", "SKILL", "QUESTION_TYPE", "CUSTOM",
];

export function parseTagCategory(value: unknown): TagCategory | null {
  const v = String(value ?? "").toUpperCase();
  return (TAG_CATEGORIES as string[]).includes(v) ? (v as TagCategory) : null;
}

/**
 * The identity of a tag.
 *
 * Lowercased, punctuation dropped, spaces hyphenated — so "Time & Work",
 * "time and work" and "Time  &  Work" all collide on the unique index and
 * cannot be created twice. "&" becomes "and" before the strip so it is not
 * silently lost, which would make "Profit & Loss" and "Profit Loss" differ.
 */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export interface TagInput {
  name: string;
  category?: TagCategory;
  exam?: Exam | null;
}

/**
 * Finds or creates tags by slug, returning their ids.
 *
 * Idempotent, so an import that runs twice does not duplicate anything, and
 * an admin typing a topic that already exists gets the existing row rather
 * than a near-duplicate. Concurrent creates of the same slug are resolved by
 * the unique index: the loser re-reads instead of failing the request.
 */
export async function ensureTags(inputs: TagInput[]): Promise<string[]> {
  const ids: string[] = [];
  for (const input of inputs) {
    const slug = slugify(input.name);
    if (!slug) continue;
    const category = input.category ?? "TOPIC";
    const existing = await prisma.tag.findUnique({
      where: { category_slug: { category, slug } },
      select: { id: true },
    });
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    try {
      const made = await prisma.tag.create({
        data: { name: input.name.trim(), slug, category, exam: input.exam ?? null },
        select: { id: true },
      });
      ids.push(made.id);
    } catch {
      // Lost a race on the unique index — the row now exists, so read it.
      const now = await prisma.tag.findUnique({
        where: { category_slug: { category, slug } },
        select: { id: true },
      });
      if (now) ids.push(now.id);
    }
  }
  return [...new Set(ids)];
}

/**
 * Checks that every id is a real tag before attaching it.
 *
 * Returns the ids that do not exist, so the caller can refuse the write and
 * name them. Attaching silently would leave a question tagged with nothing,
 * which looks identical to an untagged one and is far harder to notice.
 */
export async function missingTagIds(tagIds: string[]): Promise<string[]> {
  if (tagIds.length === 0) return [];
  const found = await prisma.tag.findMany({
    where: { id: { in: tagIds } },
    select: { id: true },
  });
  const have = new Set(found.map((t) => t.id));
  return tagIds.filter((id) => !have.has(id));
}

/** Replaces a question's tags with exactly this set, in one transaction. */
export async function setQuestionTags(questionId: string, tagIds: string[]): Promise<void> {
  const unique = [...new Set(tagIds)];
  await prisma.$transaction([
    prisma.questionTag.deleteMany({ where: { questionId, tagId: { notIn: unique.length ? unique : ["-"] } } }),
    prisma.questionTag.createMany({
      data: unique.map((tagId) => ({ questionId, tagId })),
      skipDuplicates: true,
    }),
  ]);
}

/** The shape every question payload exposes its tags in. */
export const TAG_INCLUDE = {
  select: { tag: { select: { id: true, name: true, slug: true, category: true, exam: true } } },
} as const;

export function flattenTags(
  rows: { tag: { id: string; name: string; slug: string; category: TagCategory; exam: Exam | null } }[] | undefined,
) {
  return (rows ?? []).map((r) => r.tag);
}
