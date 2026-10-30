import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const settings = readFileSync(resolve(root, "src/lib/settings.functions.ts"), "utf8");
const permissions = readFileSync(resolve(root, "src/lib/permissions.functions.ts"), "utf8");
const route = readFileSync(resolve(root, "src/routes/configuracoes.tsx"), "utf8");
const legacyRoute = readFileSync(resolve(root, "src/legacy/configuracoes.legacy.tsx"), "utf8");

describe("Configurações e Permissões — fechamento", () => {
  it("usa o resolvedor canônico de workspace", () => {
    expect(settings).toContain('from "@/lib/workspace-resolver.server"');
    expect(settings).toContain("requireActiveWorkspace");
    expect(permissions).toContain('from "@/lib/workspace-resolver.server"');
    expect(permissions).toContain("requireActiveWorkspace");
  });

  it("protege usuário-alvo e owner nas permissões", () => {
    expect(permissions).toContain("requireWorkspaceMember");
    expect(permissions).toContain('throw new Error("Usuário não pertence ao workspace ativo.")');
    expect(permissions).toContain('target.role === "owner"');
    expect(permissions).toContain("await assertOwner(sb, context.userId, wsId)");
  });

  it("protege criação e associação de setores", () => {
    expect(permissions).toContain("requireWorkspaceSector");
    expect(permissions).toContain('throw new Error("Setor não pertence ao workspace ativo.")');
    const createSectorBlock = permissions.slice(permissions.indexOf("export const createWorkSector"), permissions.indexOf("export const setUserSector"));
    expect(createSectorBlock).toContain("await assertOwner(sb, context.userId, wsId)");
  });

  it("limita convites e mutações de equipe ao workspace ativo", () => {
    for (const fn of ["revokeInvitation", "resendInvitation", "removeMember", "updateMemberRole"]) {
      const start = settings.indexOf(`export const ${fn}`);
      expect(start).toBeGreaterThan(-1);
      const block = settings.slice(start, start + 2200);
      expect(block).toContain("activeWorkspace(sb, context.userId)");
      expect(block).toContain("isOwner(sb, context.userId, wsId)");
    }
    expect(settings).toContain('throw new Error("O dono do workspace não pode ser removido.")');
    expect(settings).toContain('throw new Error("O papel do dono do workspace não pode ser alterado.")');
  });

  it("preserva as superfícies principais de Configurações", () => {
    expect(route).toContain('LegacyConfigRoute');
    for (const label of ["Perfil", "Empresa", "Equipe", "Expediente", "Plano e assinatura", "Segurança", "Sessões", "Notificações", "Preferências"]) {
      expect(legacyRoute).toContain(`title: "${label}"`);
    }
  });
});
