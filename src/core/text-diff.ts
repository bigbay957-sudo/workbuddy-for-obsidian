export interface TextDiff {
  before: string;
  removed: string;
  added: string;
  after: string;
}

export function computeTextDiff(original: string, replacement: string): TextDiff {
  let prefixLength = 0;
  const prefixLimit = Math.min(original.length, replacement.length);
  while (prefixLength < prefixLimit && original[prefixLength] === replacement[prefixLength]) prefixLength += 1;

  let suffixLength = 0;
  const suffixLimit = Math.min(original.length - prefixLength, replacement.length - prefixLength);
  while (suffixLength < suffixLimit && original[original.length - 1 - suffixLength] === replacement[replacement.length - 1 - suffixLength]) suffixLength += 1;

  return {
    before: original.slice(0, prefixLength),
    removed: original.slice(prefixLength, original.length - suffixLength),
    added: replacement.slice(prefixLength, replacement.length - suffixLength),
    after: suffixLength > 0 ? original.slice(original.length - suffixLength) : ""
  };
}
