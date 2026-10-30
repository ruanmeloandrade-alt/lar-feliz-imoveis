export type PartnerProgramRole = "affiliate" | "partner";
export type PartnerProgramStatus = "pending" | "approved" | string;

export type PartnerProgramRoleStatus = {
  role: PartnerProgramRole;
  status: PartnerProgramStatus;
};

export type PartnerProgramDestination = {
  role: PartnerProgramRole;
  status: "pending" | "approved" | "admin_preview";
  href: "/partners/afiliado" | "/partners/parceiro";
};

export type PartnerProgramEntryInput = {
  authenticated: boolean;
  role: PartnerProgramRole;
  statuses: PartnerProgramRoleStatus[];
  isAdmin: boolean;
};

export type PartnerProgramEntry =
  | { kind: "dashboard"; href: "/partners/afiliado" | "/partners/parceiro"; adminPreview: boolean }
  | { kind: "signup"; href: "/partners"; role: PartnerProgramRole };

const ELIGIBLE_STATUSES = new Set<PartnerProgramStatus>(["pending", "approved"]);

export function buildPartnerProgramDestinations(
  statuses: PartnerProgramRoleStatus[],
  isAdmin: boolean,
): PartnerProgramDestination[] {
  const destinations = new Map<PartnerProgramRole, PartnerProgramDestination>();

  for (const item of statuses) {
    if (!ELIGIBLE_STATUSES.has(item.status)) continue;
    const status = item.status as "pending" | "approved";
    destinations.set(item.role, {
      role: item.role,
      status,
      href: item.role === "affiliate" ? "/partners/afiliado" : "/partners/parceiro",
    });
  }

  if (isAdmin) {
    if (!destinations.has("affiliate")) {
      destinations.set("affiliate", {
        role: "affiliate",
        status: "admin_preview",
        href: "/partners/afiliado",
      });
    }
    if (!destinations.has("partner")) {
      destinations.set("partner", {
        role: "partner",
        status: "admin_preview",
        href: "/partners/parceiro",
      });
    }
  }

  return Array.from(destinations.values()).sort((a, b) => a.role.localeCompare(b.role));
}

export function resolvePartnerProgramEntry(input: PartnerProgramEntryInput): PartnerProgramEntry {
  const destination = buildPartnerProgramDestinations(input.statuses, input.isAdmin)
    .find((item) => item.role === input.role);

  if (!input.authenticated || !destination) {
    return { kind: "signup", href: "/partners", role: input.role };
  }

  return {
    kind: "dashboard",
    href: destination.href,
    adminPreview: destination.status === "admin_preview",
  };
}
