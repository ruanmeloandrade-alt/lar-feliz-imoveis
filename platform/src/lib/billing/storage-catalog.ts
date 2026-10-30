import type { PlanCode } from "./types";
import { planStorageGb } from "./plan-catalog";

export const BYTES_PER_GB = 1024 ** 3;

export type StorageAddonCode = "storage_10gb" | "storage_25gb" | "storage_50gb" | "storage_100gb";

export type StorageAddon = {
  code: StorageAddonCode;
  label: string;
  extraGb: number;
  monthlyPriceCents: number;
};

export const STORAGE_ADDONS: readonly StorageAddon[] = [
  { code: "storage_10gb", label: "+10 GB", extraGb: 10, monthlyPriceCents: 1900 },
  { code: "storage_25gb", label: "+25 GB", extraGb: 25, monthlyPriceCents: 3900 },
  { code: "storage_50gb", label: "+50 GB", extraGb: 50, monthlyPriceCents: 6900 },
  { code: "storage_100gb", label: "+100 GB", extraGb: 100, monthlyPriceCents: 11900 },
] as const;

export const STORAGE_METERED_KINDS = [
  "image",
  "audio",
  "video",
  "pdf",
  "document",
  "attachment",
  "other_binary",
] as const;

export function includedStorageBytes(planCode: PlanCode | string | null | undefined): number {
  return planStorageGb(planCode) * BYTES_PER_GB;
}

export function storageAddonByCode(code: string | null | undefined): StorageAddon | undefined {
  return STORAGE_ADDONS.find((addon) => addon.code === code);
}
