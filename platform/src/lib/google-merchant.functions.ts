import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AnySb } from "./google.server";

async function merchantContext(context: { supabase: unknown; userId: string }) {
  const m = await import("./google.server");
  const sb = context.supabase as unknown as AnySb;
  const workspaceId = await m.activeWorkspace(sb, context.userId);
  const { token } = await m.getGoogleAccessToken(sb, workspaceId);
  return { m, token };
}

/** Descobre automaticamente as contas Merchant Center acessíveis pelo OAuth Google atual. */
export const listMerchantAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { m, token } = await merchantContext(context);
    return { accounts: await m.merchantListAccounts(token) };
  });
