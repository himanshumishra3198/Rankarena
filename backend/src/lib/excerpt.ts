/**
 * Turn a Markdown body into a clean plain-text preview.
 *
 * The feed shows a truncated excerpt, so rendering it as Markdown is not an
 * option: a 300-character cut lands mid-syntax often enough that readers would
 * see unclosed `**` or half a link. Stripping the syntax instead gives a
 * readable sentence every time.
 */

/** Remove Markdown syntax, leaving the words behind. */
export function toPlainText(markdown: string): string {
  let out = markdown.replace(/\r\n/g, "\n");

  // Fenced code blocks: drop entirely — code rarely reads well in a preview.
  out = out.replace(/```[\s\S]*?```/g, " ");
  out = out.replace(/```[\s\S]*$/g, " "); // unterminated fence

  // Images before links, since the syntax only differs by a leading '!'.
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Inline code, then emphasis. Code first so `**x**` inside backticks stays.
  out = out.replace(/`([^`]+)`/g, "$1");
  out = out.replace(/\*\*\*([^*]+)\*\*\*/g, "$1");
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2");
  out = out.replace(/___([^_]+)___/g, "$1");
  out = out.replace(/__([^_]+)__/g, "$1");
  out = out.replace(/~~([^~]+)~~/g, "$1");

  // Block syntax, line by line.
  out = out
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")        // heading
        .replace(/^\s{0,3}>\s?/, "")             // blockquote
        .replace(/^\s{0,3}[-*+]\s+/, "")         // bullet
        .replace(/^\s{0,3}\d+[.)]\s+/, "")       // numbered item
        .replace(/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/, "") // horizontal rule
    )
    .join("\n");

  // Collapse the whitespace a preview doesn't need.
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Plain-text preview capped at `limit` characters, cut on a word boundary so
 * the last word isn't sliced in half.
 */
export function makeExcerpt(markdown: string, limit = 300): string {
  const text = toPlainText(markdown);
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}
