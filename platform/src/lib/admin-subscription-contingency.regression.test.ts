import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260902164500_admin_subscription_contingency.sql", "utf8");
const server = readFileSync("src/lib/platform-signups.functions.ts", "utf8");
const panel = readFileSync("src/components/operations/PlatformSignupsPanel.tsx", "utf8");
const entitlements = readFileSync("src/lib/billing/entitlements.test.ts", "utf8");
const billingTypes = readFileSync("src/lib/billing/types.ts", "utf8");

describe("VIGÊNCIA · contingência administrativa de assinatura", () => {
  test("migration adiciona pausa, auditoria imutável e RPC transacional de superadmin", () => {
    expect(migration).toContain("'paused'::text");
    expect(migration).toContain("subscription_admin_audit_log");
    expect(migration).toContain("subscription_admin_audit_immutable");
    expect(migration).toContain("admin_manage_subscription_contingency_v1");
    expect(migration).toContain("for update");
    expect(migration).toContain("public.has_role(v_actor, 'super_admin'::public.app_role)");
  });

  test("reversão preserva ledger e cupom global", () => {
    expect(migration).toContain("admin_promotion_reversed_at");
    expect(migration).toContain("p.provider = 'internal'");
    expect(migration).toContain("p.amount_cents = 0");
    expect(migration).toContain("p.coupon_id is not null");
    expect(migration.toLowerCase()).not.toContain("delete from public.payments");
    expect(migration.toLowerCase()).not.toContain("delete from public.coupon_usages");
    expect(migration.toLowerCase()).not.toContain("update public.coupons");
  });

  test("server e UI operam por workspace e exigem confirmação administrativa", () => {
    expect(server).toContain("managePlatformSubscriptionContingency");
    expect(server).toContain("admin_manage_subscription_contingency_v1");
    expect(server).toContain("promotionReversalEligibility");
    expect(panel).toContain("Controles administrativos da assinatura");
    expect(panel).toContain("Reverter última promoção");
    expect(panel).toContain("Cancelar ao fim da vigência");
    expect(panel).toContain("window.confirm");
  });

  test("paused é terminal para entitlement do cliente", () => {
    expect(entitlements).toContain('"paused"');
    expect(billingTypes).toContain('| "paused"');
  });
});
