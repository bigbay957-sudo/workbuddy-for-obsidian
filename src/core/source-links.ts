export interface StoredSourceReference {
  kind: "vault" | "web";
  label: string;
  path?: string;
  heading?: string;
  line?: number;
  url?: string;
}

export function extractSourceReferences(text: string, vaultPaths: string[]): StoredSourceReference[] {
  const sources: StoredSourceReference[] = [];
  const urls = text.match(/https?:\/\/[^\s<>()\]]+/g) ?? [];
  for (const rawUrl of urls) {
    const url = rawUrl.replace(/[.,;:!?，。；：！？]+$/, "");
    sources.push({ kind: "web", label: url, url });
  }

  for (const path of [...vaultPaths].sort((a, b) => b.length - a.length)) {
    const index = text.indexOf(path);
    if (index < 0) continue;
    const tail = text.slice(index + path.length, index + path.length + 160);
    const headingMatch = /^#([^\n|,，;；]+)/.exec(tail);
    const lineMatch = /^(?::|#L)(\d+)/.exec(tail);
    sources.push({
      kind: "vault",
      label: headingMatch ? `${path}#${headingMatch[1]!.trim()}` : path,
      path,
      heading: headingMatch?.[1]?.trim(),
      line: lineMatch ? Number(lineMatch[1]) : undefined
    });
  }
  return dedupeSources(sources);
}

export function dedupeSources(sources: StoredSourceReference[]): StoredSourceReference[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.kind === "web" ? `web:${source.url}` : `vault:${source.path}#${source.heading ?? ""}:${source.line ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
