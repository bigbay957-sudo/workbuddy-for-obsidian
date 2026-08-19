export function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, "").split("-")[0] ?? "";
}

export function compareVersions(left: string, right: string): number {
  const a = normalizeVersion(left).split(".").map(toPart);
  const b = normalizeVersion(right).split(".").map(toPart);
  for (let index = 0; index < Math.max(a.length, b.length, 3); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export function normalizeGitHubRepository(value: string): string | null {
  const trimmed = value.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed) ? trimmed : null;
}

function toPart(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
