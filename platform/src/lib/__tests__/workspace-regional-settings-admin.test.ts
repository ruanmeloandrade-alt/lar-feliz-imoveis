import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const settings = readFileSync(resolve(root, "src/lib/settings.functions.ts"), "utf8");
const currencyFns = readFileSync(resolve(root, "src/lib/workspace-currency.functions.ts"), "utf8");
const configUi = readFileSync(resolve(root, "src/legacy/configuracoes.legacy.tsx"), "utf8");
const regionalCache = readFileSync(resolve(root, "src/lib/workspace-currency-cache.ts"), "utf8");
const appRoot = readFileSync(resolve(root, "src/routes/__root.tsx"), "utf8");
const sidebar = readFileSync(resolve(root, "src/components/dashboard/AppSidebar.tsx"), "utf8");
const migration = readFileSync(
  resolve(root, "supabase/migrations/20260919193000_workspace_regional_settings_admin.sql"),
  "utf8",
);

describe("Regionalização da conta — moeda, fuso e owner/admin", () => {
  it("reconhece o owner real por workspaces.owner_id e memberships administrativas", () => {
    expect(settings).toContain('select("owner_id")');
    expect(settings).toContain('membership?.role === "admin"');
    expect(settings).toContain('membership?.role_type === "admin"');
    expect(settings).toContain('membership?.role_type === "owner"');
    expect(settings).toContain("canManageRegionalSettings: regionalSettingsFlag");
  });

  it("corrige o RPC legado de moeda sem depender de role_type=owner", () => {
    expect(migration).toContain("w.owner_id = auth.uid()");
    expect(migration).toContain("membership_role in ('owner', 'admin')");
    expect(migration).toContain("membership_role_type in ('owner', 'admin')");
    expect(migration).toContain("coalesce(membership_role in ('owner', 'admin'), false)");
  });

  it("salva moeda e fuso no mesmo RPC e preserva business_hours", () => {
    expect(migration).toContain("set_workspace_regional_settings");
    expect(migration).toContain("pg_timezone_names");
    expect(migration).toContain("default_currency = _currency");
    expect(migration).toContain("jsonb_set(");
    expect(migration).toContain("coalesce(business_hours, '{}'::jsonb)");
    expect(currencyFns).toContain('sb.rpc("set_workspace_regional_settings"');
  });

  it("usa o fuso persistido do workspace na tela e mantém os catálogos existentes", () => {
    expect(configUi).toContain("bundle?.workspace?.business_hours?.timezone");
    expect(configUi).toContain("setWorkspaceRegionalSettings");
    expect(configUi).toContain("canManageRegionalSettings");
    expect(configUi).toContain("TIMEZONE_GROUPS.map");
    expect(configUi).toContain("CURRENCY_GROUPS.map");
    expect(configUi).toContain("Fuso horário da conta");
  });

  it("sincroniza a regionalização no login e na troca de workspace", () => {
    expect(regionalCache).toContain("syncWorkspaceRegionalCache");
    expect(regionalCache).toContain("getWorkspaceRegionalSettings");
    expect(regionalCache).toContain("preferences.fusoHorario = timezone");
    expect(appRoot).toContain("await syncWorkspaceRegionalCache()");
    expect(sidebar).toContain("syncWorkspaceRegionalCache().catch");
    expect(sidebar).toContain("[activeWs?.id]");
  });

  it("não volta à mensagem incorreta de apenas dono para moeda/fuso", () => {
    expect(configUi).not.toContain("Só o dono ou o administrador principal podem alterar a moeda.");
  });
});
