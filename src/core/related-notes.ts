export interface NoteSignals {
  path: string;
  title: string;
  tags: string[];
  headings: string[];
  links: string[];
}

export interface RelatedNote {
  path: string;
  title: string;
  score: number;
  reasons: string[];
}

export function recommendRelatedNotes(current: NoteSignals, candidates: NoteSignals[], limit = 6): RelatedNote[] {
  const currentTokens = tokenize([current.title, ...current.headings].join(" "));
  const currentTags = new Set(current.tags);
  const currentLinks = new Set(current.links);
  const currentFolder = folderOf(current.path);

  return candidates
    .filter((candidate) => candidate.path !== current.path)
    .map((candidate) => {
      let score = 0;
      const reasons: string[] = [];
      if (currentLinks.has(candidate.path)) {
        score += 10;
        reasons.push("当前笔记已链接");
      }
      if (candidate.links.includes(current.path)) {
        score += 8;
        reasons.push("反向链接");
      }
      const sharedTags = candidate.tags.filter((tag) => currentTags.has(tag));
      if (sharedTags.length) {
        score += Math.min(8, sharedTags.length * 4);
        reasons.push(`共同标签 ${sharedTags.slice(0, 2).join("、")}`);
      }
      const candidateTokens = tokenize([candidate.title, ...candidate.headings].join(" "));
      const sharedTokens = [...candidateTokens].filter((token) => currentTokens.has(token));
      if (sharedTokens.length) {
        score += Math.min(6, sharedTokens.length * 2);
        reasons.push(`主题相近 ${sharedTokens.slice(0, 3).join("、")}`);
      }
      if (currentFolder && folderOf(candidate.path) === currentFolder) {
        score += 1;
        reasons.push("同一文件夹");
      }
      return { path: candidate.path, title: candidate.title, score, reasons };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path, "zh-CN"))
    .slice(0, Math.max(0, limit));
}

function tokenize(text: string): Set<string> {
  const result = new Set<string>();
  for (const token of text.toLowerCase().match(/[\p{Script=Han}]{2,}|[a-z0-9]{3,}/gu) ?? []) {
    if (token.length <= 12) result.add(token);
    if (/^[\p{Script=Han}]+$/u.test(token) && token.length > 2) {
      for (let index = 0; index < token.length - 1; index++) result.add(token.slice(index, index + 2));
    }
  }
  return result;
}

function folderOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}
