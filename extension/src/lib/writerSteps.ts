export function splitDraftParagraphs(md: string): string[] {
  return md
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function mergeParagraphs(
  paragraphs: string[],
  index: number,
  replacement: string
): string[] {
  if (index < 0 || index >= paragraphs.length) return paragraphs;
  const out = [...paragraphs];
  out[index] = replacement.trim();
  return out;
}

export function joinParagraphs(paragraphs: string[]): string {
  return paragraphs.join('\n\n');
}
