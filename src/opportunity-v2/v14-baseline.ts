export function uniqueSortedIds(groups: string[][]): string[] {
  return [...new Set(groups.flat().filter((id) => /^oppv2_[a-z0-9_-]+$/u.test(id)))].sort();
}

export function sameStringSet(left: string[], right: string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
}

export function extractOpportunityIds(content: string): string[] {
  const ids: string[] = [];
  const patterns = [
    /data-opportunity-id\s*=\s*["'](oppv2_[a-z0-9_-]+)["']/gu,
    /href\s*=\s*["'][^"']*?\/ich\/(?:opportunities|procurement)\/(oppv2_[a-z0-9_-]+)(?:[?#/][^"']*)?["']/gu,
    /\]\(\s*[^)]*?\/ich\/(?:opportunities|procurement)\/(oppv2_[a-z0-9_-]+)(?:[?#][^)]*)?\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) if (match[1]) ids.push(match[1]);
  }
  return [...new Set(ids)].sort();
}

export function extractCardTranslationStatuses(html: string): Array<{ id: string; status: "translated" | "pending" | "failed" | "unlabeled" }> {
  const cards = html.match(/<article\b(?=[^>]*class=["'][^"']*\bich-card\b)[\s\S]*?<\/article>/gu) ?? [];
  const output: Array<{ id: string; status: "translated" | "pending" | "failed" | "unlabeled" }> = [];
  for (const card of cards) {
    const id = extractOpportunityIds(card)[0];
    if (!id) continue;
    const status = /class=["'][^"']*\bich-original\b/u.test(card)
      ? "translated"
      : /中文翻译失败/u.test(card)
        ? "failed"
        : /中文待补/u.test(card)
          ? "pending"
          : "unlabeled";
    output.push({ id, status });
  }
  return output;
}

export function extractMemoTranslationStatuses(html: string): Array<{ id: string; status: "translated" | "unlabeled" }> {
  const rows = html.match(/<tr\b[^>]*data-opportunity-id=["']oppv2_[a-z0-9_-]+["'][^>]*>[\s\S]*?<\/tr>/gu) ?? [];
  return rows.flatMap((row) => {
    const id = row.match(/data-opportunity-id=["'](oppv2_[a-z0-9_-]+)["']/u)?.[1];
    if (!id) return [];
    const cells = row.split(/<\/td>/u);
    const titleCell = cells[1] ?? "";
    return [{ id, status: /<small\b/u.test(titleCell) ? "translated" as const : "unlabeled" as const }];
  });
}
