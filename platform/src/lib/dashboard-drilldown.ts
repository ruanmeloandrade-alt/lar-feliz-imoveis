import type { DrilldownLead } from "@/lib/mock-dashboard";

export type DashboardDrilldownEntity =
  | "lead"
  | "product"
  | "company"
  | "form"
  | "tag"
  | "custom_field"
  | "tracking"
  | "media"
  | "work";

export type DashboardLeadDrilldown = {
  entity: "lead";
  title: string;
  subtitle: string;
  leads: DrilldownLead[];
  source?: string;
};

export type DashboardEntityDrilldown = {
  entity: Exclude<DashboardDrilldownEntity, "lead">;
  title: string;
  subtitle: string;
  source?: string;
  recordIds?: string[];
  filter?: Record<string, string | number | boolean>;
};

export type DashboardDrilldownRequest = DashboardLeadDrilldown | DashboardEntityDrilldown;

export function isLeadDrilldown(request: DashboardDrilldownRequest): request is DashboardLeadDrilldown {
  return request.entity === "lead";
}

export function leadDrilldown(
  title: string,
  subtitle: string,
  leads: DrilldownLead[],
  source?: string,
): DashboardLeadDrilldown {
  return { entity: "lead", title, subtitle, leads, source };
}
