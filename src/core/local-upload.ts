export const MAX_LOCAL_UPLOAD_BYTES = 200 * 1024 * 1024;

export function buildUniqueUploadPath(fileName: string, pathExists: (path: string) => boolean): string {
  const safeName = sanitizeUploadFileName(fileName);
  const dot = safeName.lastIndexOf(".");
  const stem = dot > 0 ? safeName.slice(0, dot) : safeName;
  const extension = dot > 0 ? safeName.slice(dot) : "";
  let path = `WorkBuddy/Uploads/${safeName}`;
  let suffix = 2;
  while (pathExists(path)) path = `WorkBuddy/Uploads/${stem}-${suffix++}${extension}`;
  return path;
}

export function sanitizeUploadFileName(fileName: string): string {
  return fileName.replace(/[\\/:*?"<>|#\[\]^\x00-\x1f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 160) || "本地文件";
}

export function canUploadLocalFile(size: number): boolean {
  return Number.isFinite(size) && size >= 0 && size <= MAX_LOCAL_UPLOAD_BYTES;
}
