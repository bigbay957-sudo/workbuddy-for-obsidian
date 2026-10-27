import { describe, expect, it } from "vitest";
import { AUTH_RECOVERY_HINT, describeTurnRefusal, looksLikeAuthFailure } from "../src/core/auth-hint";

describe("auth hint", () => {
  it("只能从认证类文案里认出登录失效", () => {
    expect(looksLikeAuthFailure("401 Authentication required. Please use /login command")).toBe(true);
    expect(looksLikeAuthFailure("Error: token expired, please re-login")).toBe(true);
    expect(looksLikeAuthFailure("CLI 登录已失效")).toBe(true);
    expect(looksLikeAuthFailure("")).toBe(false);
    expect(looksLikeAuthFailure("quota exceeded")).toBe(false);
  });

  it("静默拒绝（一个字都没输出）按登录失效处理", () => {
    const verdict = describeTurnRefusal({ hadOutput: false });
    expect(verdict.kind).toBe("auth");
    expect(verdict.message).toContain(AUTH_RECOVERY_HINT);
  });

  it("stderr 里写明认证失败时，即使有输出也判 auth", () => {
    const verdict = describeTurnRefusal({
      hadOutput: true,
      stderrTail: "Authentication required. Please use /login command to sign in"
    });
    expect(verdict.kind).toBe("auth");
    expect(verdict.message).toContain("/login");
  });

  it("有输出且无认证痕迹时按普通拒绝处理，不误导用户去登录", () => {
    const verdict = describeTurnRefusal({ hadOutput: true, stderrTail: "" });
    expect(verdict.kind).toBe("refusal");
    expect(verdict.message).not.toContain("/login");
  });
});
