import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const salesRoute = readFileSync("src/routes/index.tsx", "utf8");
const router = readFileSync("src/router.tsx", "utf8");
const responsiveCss = readFileSync("src/sales-responsive.css", "utf8");

describe("sales page responsive contract", () => {
  it("keeps the known compact and desktop hero variants explicit", () => {
    expect(salesRoute).toContain('className="md:hidden"><MobileHeroWorkspace />');
    expect(salesRoute).toContain('className="hidden md:block"><HeroWorkspace />');
  });

  it("loads the landing responsive guard globally", () => {
    expect(router).toContain('import "./sales-responsive.css";');
  });

  it("keeps the compact hero between md and lg and hides the dense desktop workspace", () => {
    expect(responsiveCss).toContain("min-width: 768px");
    expect(responsiveCss).toContain("max-width: 1023.98px");
    expect(responsiveCss).toContain("> .md\\:hidden");
    expect(responsiveCss).toContain("display: block !important");
    expect(responsiveCss).toContain("> .hidden.md\\:block");
    expect(responsiveCss).toContain("display: none !important");
  });

  it("scopes the override to the sales hero instead of changing md utilities globally", () => {
    expect(responsiveCss).toContain('div[class*="bg-[#f5f7fa]"][class*="overflow-x-hidden"]');
    expect(responsiveCss).toContain("> section:first-child");
    expect(responsiveCss).toContain('div[class*="max-w-[1240px]"]');
  });
});
