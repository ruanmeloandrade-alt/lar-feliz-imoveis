import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sidebar = readFileSync("src/components/dashboard/AppSidebar.tsx", "utf8");

describe("AppSidebar native navigation links", () => {
  test("usa Link do TanStack Router para destinos reais", () => {
    expect(sidebar).toContain('import { Link, useRouterState } from "@tanstack/react-router";');
    expect(sidebar).toContain('<Link to={item.to as never}');
    expect(sidebar).toContain('<Link\n                    to={child.to as never}');
    expect(sidebar).toContain('to={"/crm/funis-de-venda" as never} search={{ funnelId: funnel.id } as never}');
  });

  test("não depende mais de router.navigate para a sidebar", () => {
    expect(sidebar).not.toContain("useRouter,");
    expect(sidebar).not.toContain("router.navigate(");
    expect(sidebar).not.toContain("const goTo =");
  });

  test("preserva botões que são ações, não navegação", () => {
    expect(sidebar).toContain('onClick={() => setOpen((value) => !value)}');
    expect(sidebar).toContain('onClick={handleLogout}');
    expect(sidebar).toContain('aria-label="Abrir menu"');
  });

  test("workspace e funis também expõem href real pelo Link", () => {
    expect(sidebar).toContain('<Link to={"/contas" as never}');
    expect(sidebar).toContain('>{funnel.name}</Link>');
    expect(sidebar).toContain('>+{funnels.length - 8} funis</Link>');
  });
});
