import { FuzzySuggestModal, TFile, TFolder, getAllTags, type App } from "obsidian";

export type ContextSuggestItem =
  | { kind: "upload"; label: string; detail: string }
  | { kind: "file"; file: TFile; label: string; detail: string }
  | { kind: "folder"; path: string; label: string; detail: string }
  | { kind: "tag"; tag: string; label: string; detail: string }
  | { kind: "heading"; file: TFile; heading: string; level: number; label: string; detail: string };

export class ContextSuggestModal extends FuzzySuggestModal<ContextSuggestItem> {
  private readonly items: ContextSuggestItem[];

  constructor(app: App, private readonly onChoose: (item: ContextSuggestItem) => void) {
    super(app);
    this.setPlaceholder("上传本地文件，或搜索笔记、文件夹、标签、标题…");
    this.items = this.buildItems();
  }

  getItems(): ContextSuggestItem[] {
    return this.items;
  }

  getItemText(item: ContextSuggestItem): string {
    return `${kindLabel(item.kind)} ${item.label} ${item.detail}`;
  }

  renderSuggestion(match: { item: ContextSuggestItem }, el: HTMLElement): void {
    const item = match.item;
    const row = el.createDiv({ cls: "workbuddy-context-suggestion" });
    row.createSpan({ text: kindLabel(item.kind), cls: "workbuddy-context-suggestion-kind" });
    const main = row.createDiv({ cls: "workbuddy-context-suggestion-main" });
    main.createDiv({ text: item.label, cls: "workbuddy-context-suggestion-title" });
    main.createDiv({ text: item.detail, cls: "workbuddy-context-suggestion-detail" });
  }

  onChooseItem(item: ContextSuggestItem): void {
    this.onChoose(item);
  }

  private buildItems(): ContextSuggestItem[] {
    const items: ContextSuggestItem[] = [{
      kind: "upload",
      label: "上传本地文件",
      detail: "从电脑选择一个或多个文件，复制到 WorkBuddy/Uploads"
    }];
    const tags = new Set<string>();
    for (const file of this.app.vault.getFiles()) {
      if (isSupportedFile(file)) {
        items.push({ kind: "file", file, label: file.basename, detail: file.path });
      }
      if (file.extension !== "md") continue;
      const cache = this.app.metadataCache.getFileCache(file);
      for (const tag of getAllTags(cache ?? {}) ?? []) tags.add(tag);
      for (const heading of cache?.headings ?? []) {
        items.push({
          kind: "heading",
          file,
          heading: heading.heading,
          level: heading.level,
          label: heading.heading,
          detail: `${file.path}#${heading.heading}`
        });
      }
    }
    for (const item of this.app.vault.getAllLoadedFiles()) {
      if (!(item instanceof TFolder) || !item.path || item.path === "/") continue;
      items.push({ kind: "folder", path: item.path, label: item.name, detail: item.path });
    }
    for (const tag of [...tags].sort((a, b) => a.localeCompare(b))) {
      items.push({ kind: "tag", tag, label: tag, detail: "引用带此标签的笔记" });
    }
    return items;
  }
}

function isSupportedFile(file: TFile): boolean {
  return ["md", "txt", "csv", "tsv", "json", "yaml", "yml", "pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(file.extension.toLowerCase());
}

function kindLabel(kind: ContextSuggestItem["kind"]): string {
  switch (kind) {
    case "upload": return "上传";
    case "file": return "文件";
    case "folder": return "文件夹";
    case "tag": return "标签";
    case "heading": return "标题";
  }
}
