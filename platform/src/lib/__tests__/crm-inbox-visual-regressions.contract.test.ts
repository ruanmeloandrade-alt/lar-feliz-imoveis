import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => fs.readFileSync(path, "utf8");

describe("CRM/Inbox visual regression contract", () => {
  it("keeps Gestor CRM on the stable pre-QA proportions", () => {
    const surface = read("src/components/crm/RobustCrmSurface.tsx");
    expect(surface).toContain("!w-[256px]");
    expect(surface).toContain("!max-w-[1180px]");
    expect(surface).not.toContain("!w-[272px]");
    expect(surface).not.toContain("!max-w-[1240px]");
  });

  it("shows only the canonical stage bulk selector and reveals it on hover", () => {
    const css = read("src/components/crm/crm-regression-fixes.css");
    expect(css).toContain('button[role="checkbox"]');
    expect(css).toContain("display: none");
    expect(css).toContain("opacity: 0");
    expect(css).toContain(":hover");
    expect(css).toContain('[data-state="checked"]');
  });

  it("mounts SalesBot and Agente IA inside the left side of the composer", () => {
    const enhancement = read("src/components/inbox/InboxLeadRouteEnhancements.tsx");
    expect(enhancement).toContain('data-inbox-lead-actions="composer"');
    expect(enhancement).toContain("createPortal");
    expect(enhancement).toContain("order-first");
    expect(enhancement).toContain('input[type="file"][accept*="application/pdf"]');
    expect(enhancement).not.toContain("bottom-[10px]");
    expect(enhancement).not.toContain("bottom-[76px]");
    expect(enhancement).not.toContain("right-[58px]");
    expect(enhancement).toContain("startSalesbotForLead");
    expect(enhancement).toContain("activateConversationAgentForLead");
    expect(enhancement).toContain("stopLeadSalesbots");
    expect(enhancement).toContain("stopLeadConversationAgent");
  });

  it("does not reintroduce the full-viewport wrapper around the lead inbox route", () => {
    const route = read("src/routes/inbox.leads.$leadId.tsx");
    expect(route).toContain('className="relative w-full min-w-0"');
    expect(route).not.toContain("h-[100dvh]");
    expect(route).not.toContain("md:h-screen");
  });

  it("uses /l/:slug as the canonical public form distribution contract", () => {
    const forms = read("src/lib/forms.functions.ts");
    const publicRoute = read("src/routes/l.$slug.tsx");
    expect(forms).toContain('FORM_PUBLIC_PREFIX = "l"');
    expect(forms).toContain("return buildFormShareUrl(formSlug, leadId)");
    expect(forms).not.toContain("const base = `${FORM_SHARE_ORIGIN}/${ws}/${fs}`");
    expect(publicRoute).toContain('createFileRoute("/l/$slug")');
    expect(publicRoute).toContain("getPublicForm");
    expect(publicRoute).toContain("submitPublicForm");
  });
});
