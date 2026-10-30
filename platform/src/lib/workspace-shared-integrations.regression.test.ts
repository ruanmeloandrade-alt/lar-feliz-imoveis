import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const contas = readFileSync("src/routes/contas.tsx", "utf8");
const sidebar = readFileSync("src/components/dashboard/AppSidebar.tsx", "utf8");
const metaPanel = readFileSync("src/components/integrations/MetaConnectPanel.tsx", "utf8");
const metaFns = readFileSync("src/lib/meta.functions.ts", "utf8");
const catalogFns = readFileSync("src/lib/integrations.functions.ts", "utf8");

const metaStatusStart = metaFns.indexOf("export const getMetaStatus");
const metaStatusEnd = metaFns.indexOf("export const disconnectMeta", metaStatusStart);
const metaStatusSource = metaFns.slice(metaStatusStart, metaStatusEnd);

describe("workspace shared integrations", () => {
  test("workspace switch resets all client state with a hard navigation", () => {
    expect(contas).toContain('window.location.assign("/home")');
    expect(contas).toContain("currentWorkspaceId");
    expect(contas).toContain(">Atual<");
  });

  test("active workspace is explicit and switchable from the sidebar", () => {
    expect(sidebar).toContain('goTo("/contas")');
    expect(sidebar).toContain("Workspace ativo · trocar conta");
    expect(sidebar).toContain("staleTime: 0");
    expect(sidebar).toContain('refetchOnMount: "always"');
  });

  test("Meta status and assets stay workspace scoped, never user scoped", () => {
    expect(metaStatusSource).toContain('z.object({ workspaceId: z.string().uuid() })');
    expect(metaStatusSource).toContain('.eq("workspace_id", data.workspaceId)');
    expect(metaStatusSource).not.toContain('.eq("user_id", context.userId)');
    expect(metaPanel).toContain("compartilhados com todos os membros autorizados deste workspace");
    expect(catalogFns).toContain("const workspaceId = await activeWorkspace(sb, context.userId);");
    expect(catalogFns).toContain('.eq("workspace_id", workspaceId)');
  });
});
