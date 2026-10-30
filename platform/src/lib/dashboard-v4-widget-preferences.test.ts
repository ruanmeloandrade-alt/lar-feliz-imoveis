import { describe, expect, it } from "vitest";
import {
  clearDashboardV4WidgetMetric,
  dashboardV4PreferencesStorageKey,
  filterDashboardFunnel,
  getDashboardV4KpiOptions,
  getDashboardV4WidgetMetric,
  isWidgetHidden,
  normalizeDashboardV4Preferences,
  parseDashboardV4Preferences,
  setDashboardV4WidgetMetric,
  setWidgetHidden,
  type DashboardV4WidgetPreferences,
} from "./dashboard-v4-widget-preferences";

const emptyPreferences: DashboardV4WidgetPreferences = {
  hiddenWidgetIds: [],
  funnelName: null,
  formIds: null,
  kpiMetricByWidget: {},
};

describe("Dashboard V4 widget preferences", () => {
  it("scopes persisted preferences by workspace", () => {
    expect(dashboardV4PreferencesStorageKey("ws-123")).toBe("mkton:dashboard-v4:widgets:ws-123");
    expect(dashboardV4PreferencesStorageKey()).toBe("mkton:dashboard-v4:widgets:default");
  });

  it("normalizes malformed persisted preferences safely", () => {
    expect(parseDashboardV4Preferences("{broken")).toEqual(emptyPreferences);
    expect(normalizeDashboardV4Preferences({ hiddenWidgetIds: ["seller-ranking", "unknown"], funnelName: " Comercial ", formIds: ["a", "a", ""] })).toEqual({
      hiddenWidgetIds: ["seller-ranking"],
      funnelName: "Comercial",
      formIds: ["a"],
      kpiMetricByWidget: {},
    });
  });

  it("hides and restores an individual widget without changing other preferences", () => {
    const base: DashboardV4WidgetPreferences = { hiddenWidgetIds: [], funnelName: "Inbound", formIds: ["form-1"], kpiMetricByWidget: {} };
    const hidden = setWidgetHidden(base, "seller-ranking", true);
    expect(isWidgetHidden(hidden, "seller-ranking")).toBe(true);
    expect(hidden.funnelName).toBe("Inbound");
    expect(hidden.formIds).toEqual(["form-1"]);
    expect(isWidgetHidden(setWidgetHidden(hidden, "seller-ranking", false), "seller-ranking")).toBe(false);
  });

  it("filters the sales funnel by the selected funnel", () => {
    const rows = [
      { id: "1", funnelName: "Inbound" },
      { id: "2", funnelName: "Outbound" },
      { id: "3", funnelName: "Inbound" },
    ];
    expect(filterDashboardFunnel(rows, "Inbound").map((row) => row.id)).toEqual(["1", "3"]);
    expect(filterDashboardFunnel(rows, null)).toEqual(rows);
  });

  it("keeps the retired forms widget hidden regardless of saved preferences", () => {
    expect(isWidgetHidden(emptyPreferences, "forms")).toBe(true);
    expect(isWidgetHidden(setWidgetHidden(emptyPreferences, "forms", false), "forms")).toBe(true);
  });

  it("deduplicates hidden widgets and preserves legacy selections", () => {
    expect(normalizeDashboardV4Preferences({ hiddenWidgetIds: ["seller-ranking", "seller-ranking"], funnelName: null, formIds: ["a", "a", "b"] })).toEqual({
      hiddenWidgetIds: ["seller-ranking"],
      funnelName: null,
      formIds: ["a", "b"],
      kpiMetricByWidget: {},
    });
  });

  it("only exposes KPI options from the widget context", () => {
    expect(getDashboardV4KpiOptions("tracking-events").map((option) => option.id)).toEqual([
      "tracking.events",
      "tracking.sessions",
      "tracking.conversions",
      "tracking.revenue",
    ]);
    expect(getDashboardV4KpiOptions("tracking-events").some((option) => option.id === "social.reach")).toBe(false);
    expect(getDashboardV4KpiOptions("media-spend").some((option) => option.id === "media.roas")).toBe(true);
    expect(getDashboardV4KpiOptions("media-spend").some((option) => option.id === "executive.revenue")).toBe(false);
  });

  it("rejects incompatible KPI injection and preserves the safe fallback", () => {
    const selected = setDashboardV4WidgetMetric(emptyPreferences, "tracking-events", "tracking.sessions");
    expect(getDashboardV4WidgetMetric(selected, "tracking-events", "tracking.events")).toBe("tracking.sessions");

    const rejected = setDashboardV4WidgetMetric(selected, "tracking-events", "social.reach");
    expect(rejected).toEqual(selected);

    const normalized = normalizeDashboardV4Preferences({
      ...emptyPreferences,
      kpiMetricByWidget: {
        "tracking-events": "social.reach",
        "media-spend": "media.roas",
      },
    });
    expect(normalized.kpiMetricByWidget).toEqual({ "media-spend": "media.roas" });
    expect(getDashboardV4WidgetMetric(normalized, "tracking-events", "tracking.events")).toBe("tracking.events");
  });

  it("restores the block default after a custom KPI is cleared", () => {
    const selected = setDashboardV4WidgetMetric(emptyPreferences, "tracking-events", "tracking.sessions");
    expect(getDashboardV4WidgetMetric(selected, "tracking-events", "tracking.events")).toBe("tracking.sessions");

    const restored = clearDashboardV4WidgetMetric(selected, "tracking-events");
    expect(restored.kpiMetricByWidget).toEqual({});
    expect(getDashboardV4WidgetMetric(restored, "tracking-events", "tracking.events")).toBe("tracking.events");
    expect(clearDashboardV4WidgetMetric(restored, "tracking-events")).toBe(restored);
  });
});
