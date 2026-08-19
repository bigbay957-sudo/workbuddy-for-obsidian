import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { requestUrl } from "obsidian";
import { compareVersions, normalizeGitHubRepository, normalizeVersion } from "./version";

const REQUIRED_FILES = ["main.js", "manifest.json", "styles.css"] as const;

export interface PluginUpdateInfo {
  repository: string;
  currentVersion: string;
  version: string;
  releaseName: string;
  releaseUrl: string;
  notes: string;
  publishedAt: string;
  assets: Record<string, string>;
}

export async function checkPluginUpdate(repositoryInput: string, currentVersion: string): Promise<PluginUpdateInfo> {
  const repository = normalizeGitHubRepository(repositoryInput);
  if (!repository) throw new Error("更新仓库格式应为 owner/repository 或完整 GitHub 地址");
  const response = await requestUrl({
    url: `https://api.github.com/repos/${repository}/releases/latest`,
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
  });
  if (response.status < 200 || response.status >= 300) throw new Error(`GitHub 返回 ${response.status}`);
  const release = response.json as Record<string, unknown>;
  const version = normalizeVersion(String(release.tag_name ?? ""));
  if (!version) throw new Error("最新 Release 没有有效版本号");
  const assets: Record<string, string> = {};
  for (const item of Array.isArray(release.assets) ? release.assets : []) {
    if (!isRecord(item)) continue;
    const name = String(item.name ?? "");
    const url = String(item.browser_download_url ?? "");
    if (name && url) assets[name] = url;
  }
  return {
    repository,
    currentVersion,
    version,
    releaseName: String(release.name ?? release.tag_name ?? version),
    releaseUrl: String(release.html_url ?? `https://github.com/${repository}/releases/latest`),
    notes: String(release.body ?? ""),
    publishedAt: String(release.published_at ?? ""),
    assets
  };
}

export function hasNewerVersion(info: PluginUpdateInfo): boolean {
  return compareVersions(info.version, info.currentVersion) > 0;
}

export async function installPluginUpdate(info: PluginUpdateInfo, pluginDirectory: string, pluginId: string): Promise<string> {
  for (const file of REQUIRED_FILES) {
    if (!info.assets[file]) throw new Error(`Release 缺少 ${file}，无法安全更新`);
  }
  const downloaded = new Map<string, string>();
  for (const file of REQUIRED_FILES) {
    const response = await requestUrl({ url: info.assets[file]! });
    if (response.status < 200 || response.status >= 300) throw new Error(`下载 ${file} 失败：${response.status}`);
    const text = response.text;
    const limit = file === "main.js" ? 20_000_000 : file === "styles.css" ? 2_000_000 : 100_000;
    if (!text || text.length > limit) throw new Error(`${file} 内容为空或大小异常`);
    downloaded.set(file, text);
  }
  const manifest = JSON.parse(downloaded.get("manifest.json")!) as Record<string, unknown>;
  if (manifest.id !== pluginId) throw new Error(`插件 ID 不匹配：${String(manifest.id ?? "未知")}`);
  if (normalizeVersion(String(manifest.version ?? "")) !== info.version) throw new Error("manifest.json 版本与 Release 标签不一致");

  const backupDirectory = join(pluginDirectory, `.backup-${info.currentVersion}`);
  await mkdir(backupDirectory, { recursive: true });
  for (const file of REQUIRED_FILES) {
    try {
      await writeFile(join(backupDirectory, file), await readFile(join(pluginDirectory, file)));
    } catch {
      // 首次安装可能缺少某个可选文件，不阻塞更新。
    }
  }
  for (const file of REQUIRED_FILES) {
    const temporary = join(pluginDirectory, `${file}.next`);
    await writeFile(temporary, downloaded.get(file)!, "utf8");
    await rename(temporary, join(pluginDirectory, file));
  }
  return backupDirectory;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
