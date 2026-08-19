export type ContextReferenceKind = "folder" | "tag" | "heading";

export interface StoredContextReference {
  id: string;
  kind: ContextReferenceKind;
  label: string;
  path?: string;
  tag?: string;
  heading?: string;
  level?: number;
}

export function extractHeadingSection(content: string, heading: string, level?: number): string {
  const lines = content.split("\n");
  const target = heading.trim();
  let start = -1;
  let targetLevel = level ?? 6;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[index] ?? "");
    if (!match || match[2]?.trim() !== target) continue;
    start = index;
    targetLevel = match[1]!.length;
    break;
  }
  if (start < 0) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+/.exec(lines[index] ?? "");
    if (match && match[1]!.length <= targetLevel) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

export function isReadableTextExtension(extension: string): boolean {
  return ["md", "txt", "csv", "tsv", "json", "yaml", "yml", "xml", "html", "css", "js", "ts"].includes(extension.toLowerCase());
}

export function contextReferenceKey(reference: StoredContextReference): string {
  return reference.id;
}
