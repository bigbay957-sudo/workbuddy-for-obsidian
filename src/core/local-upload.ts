export const MAX_LOCAL_UPLOAD_BYTES = 200 * 1024 * 1024;

/**
 * 文件名里必须替换掉的字符：路径分隔符、Windows 保留字符，以及全部 C0 控制字符。
 *
 * 这里刻意用「逐字符判断 + charCodeAt」而不是正则字面量：正则里写 `\x00-\x1f`
 * 会被审核 lint 判为「正则中出现意外的控制字符」，而字符类里的 `\[` `\]` 又会被
 * 判为「不必要的转义字符」。用码位判断同时绕开这两条，行为与原来的正则一致。
 */
const ILLEGAL_FILE_NAME_CHARS = '\\/:*?"<>|#[]^';

function isIllegalFileNameChar(ch: string): boolean {
  return ILLEGAL_FILE_NAME_CHARS.includes(ch) || ch.charCodeAt(0) < 0x20;
}

/**
 * 把非法字符替换为 "-"、压缩连续空白并按需要裁剪长度。
 * 只做清洗，不补默认名（可能需要空串语义的调用方自行判断）。
 */
export function sanitizeFileName(value: string, maxLength = 160): string {
  let filtered = "";
  for (const ch of value) filtered += isIllegalFileNameChar(ch) ? "-" : ch;
  return filtered.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function sanitizeUploadFileName(fileName: string): string {
  return sanitizeFileName(fileName) || "本地文件";
}

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

export function canUploadLocalFile(size: number): boolean {
  return Number.isFinite(size) && size >= 0 && size <= MAX_LOCAL_UPLOAD_BYTES;
}
