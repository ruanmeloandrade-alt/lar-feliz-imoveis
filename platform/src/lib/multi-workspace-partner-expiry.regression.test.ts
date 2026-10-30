import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("multi-workspace users and partner expiry", () => {
  it("reuses an existing Auth identity instead of blocking another workspace", () => {
    const settings = source("src/lib/settings.functions.ts");
    expect(settings).toContain("reusedExistingUser = true");
    expect(settings).toContain("O mesmo usuário pode pertencer a vários workspaces");
    expect(settings).not.toContain("Use um e-mail exclusivo para o funcionário");
    expect(settings).not.toContain("Bloqueia se já for membro de outro workspace");
  });

  it("stores and applies technical partner access duration", () => {
    const settings = source("src/lib/settings.functions.ts");
    const legacy = source("src/legacy/configuracoes.legacy.tsx");
    const migration = source("supabase/migrations/20260902114500_partner_access_expiry.sql");

    expect(settings).toContain("access_days");
    expect(settings).toContain("access_expires_at");
    expect(settings).toContain("accessDays * 86400_000");
    expect(legacy).toContain("Tempo indeterminado");
    expect(legacy).toContain("Quantidade de dias");
    expect(migration).toContain("workspace_invitations_access_days_check");
  });

  it("does not resolve an expired membership as active workspace access", () => {
    const resolver = source("src/lib/workspace-resolver.server.ts");
    expect(resolver).toContain("access_expires_at");
    expect(resolver).toContain("getTime() > Date.now()");
    expect(resolver).toContain("Membership vencida deixa de ser acesso válido imediatamente");
  });
});
