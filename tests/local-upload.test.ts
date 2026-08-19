import { describe, expect, it } from "vitest";
import { MAX_LOCAL_UPLOAD_BYTES, buildUniqueUploadPath, canUploadLocalFile, sanitizeUploadFileName } from "../src/core/local-upload";

describe("local file upload", () => {
  it("sanitizes names and keeps the extension", () => {
    expect(sanitizeUploadFileName("项目/方案?.pdf")).toBe("项目-方案-.pdf");
  });

  it("adds a suffix when the vault path already exists", () => {
    const existing = new Set(["WorkBuddy/Uploads/方案.pdf", "WorkBuddy/Uploads/方案-2.pdf"]);
    expect(buildUniqueUploadPath("方案.pdf", (path) => existing.has(path))).toBe("WorkBuddy/Uploads/方案-3.pdf");
  });

  it("rejects files above the safety limit", () => {
    expect(canUploadLocalFile(MAX_LOCAL_UPLOAD_BYTES)).toBe(true);
    expect(canUploadLocalFile(MAX_LOCAL_UPLOAD_BYTES + 1)).toBe(false);
  });
});
