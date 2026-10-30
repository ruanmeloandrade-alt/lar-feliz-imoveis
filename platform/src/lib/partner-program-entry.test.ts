import { describe, expect, it } from "vitest";
import { buildPartnerProgramDestinations, resolvePartnerProgramEntry } from "./partner-program-entry";

describe("resolvePartnerProgramEntry", () => {
  it("keeps unauthenticated acquisition on public signup", () => {
    expect(resolvePartnerProgramEntry({ authenticated: false, role: "affiliate", statuses: [], isAdmin: false })).toEqual({
      kind: "signup",
      href: "/partners",
      role: "affiliate",
    });
  });

  it.each(["pending", "approved"])("opens an existing affiliate with status %s", (status) => {
    expect(resolvePartnerProgramEntry({
      authenticated: true,
      role: "affiliate",
      statuses: [{ role: "affiliate", status }],
      isAdmin: false,
    })).toEqual({ kind: "dashboard", href: "/partners/afiliado", adminPreview: false });
  });

  it.each(["pending", "approved"])("opens an existing partner with status %s", (status) => {
    expect(resolvePartnerProgramEntry({
      authenticated: true,
      role: "partner",
      statuses: [{ role: "partner", status }],
      isAdmin: false,
    })).toEqual({ kind: "dashboard", href: "/partners/parceiro", adminPreview: false });
  });

  it("gives program admin a dashboard preview when that role is missing", () => {
    expect(resolvePartnerProgramEntry({ authenticated: true, role: "affiliate", statuses: [], isAdmin: true })).toEqual({
      kind: "dashboard",
      href: "/partners/afiliado",
      adminPreview: true,
    });
  });

  it("sends an authenticated but truly unlinked account to signup", () => {
    expect(resolvePartnerProgramEntry({ authenticated: true, role: "affiliate", statuses: [], isAdmin: false })).toEqual({
      kind: "signup",
      href: "/partners",
      role: "affiliate",
    });
  });
});

describe("buildPartnerProgramDestinations", () => {
  it("returns both real approved roles for an existing dual-role account", () => {
    expect(buildPartnerProgramDestinations([
      { role: "affiliate", status: "approved" },
      { role: "partner", status: "approved" },
    ], true)).toEqual([
      { role: "affiliate", status: "approved", href: "/partners/afiliado" },
      { role: "partner", status: "approved", href: "/partners/parceiro" },
    ]);
  });

  it("creates admin previews only for roles that do not already exist", () => {
    expect(buildPartnerProgramDestinations([
      { role: "affiliate", status: "pending" },
    ], true)).toEqual([
      { role: "affiliate", status: "pending", href: "/partners/afiliado" },
      { role: "partner", status: "admin_preview", href: "/partners/parceiro" },
    ]);
  });

  it("does not expose blocked or rejected commercial roles", () => {
    expect(buildPartnerProgramDestinations([
      { role: "affiliate", status: "blocked" },
      { role: "partner", status: "rejected" },
    ], false)).toEqual([]);
  });
});
