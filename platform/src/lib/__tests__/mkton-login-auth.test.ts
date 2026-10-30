import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("MKTOn password-only authentication", () => {
  it("keeps normal login on email and password without OTP", () => {
    const login = source("../../routes/login.tsx");
    expect(login).toContain("signInWithPassword");
    expect(login).not.toContain("signInWithOtp");
    expect(login).toContain("/api/public/auth/confirm-existing");
    expect(login).toContain("isEmailNotConfirmed");
  });

  it("confirms only legacy accounts that fail specifically as email_not_confirmed", () => {
    const endpoint = source("../../routes/api/public/auth/confirm-existing.ts");
    expect(endpoint).toContain('error?.code === "email_not_confirmed"');
    expect(endpoint).toContain("signInWithPassword");
    expect(endpoint).toContain("auth.admin.updateUserById");
    expect(endpoint).toContain("email_confirm: true");
    expect(endpoint).toContain('status: 401');
  });

  it("disables mandatory email confirmation for new accounts", () => {
    const config = source("../../../supabase/config.toml");
    expect(config).toContain("enable_confirmations = false");
  });

  it("versions legacy confirmation and the requested suspicious-account purge", () => {
    const migration = source("../../../supabase/migrations/20260811121500_confirm_legacy_users_and_remove_suspicious_accounts.sql");
    expect(migration).toContain("teste.tenant1785449846@mkton-test.com");
    expect(migration).toContain("labhunt_56941_wqriaxzy@ues.edu.pl");
    expect(migration).toContain("email_confirmed_at = coalesce(email_confirmed_at, now())");
    expect(migration).toContain("delete from auth.users");
  });
});
