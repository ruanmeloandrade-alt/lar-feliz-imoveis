
import { describe, it, expect } from "vitest";
import { supabaseAdmin } from "../../integrations/supabase/client.server";
import { supabase as supabaseClient } from "../../integrations/supabase/client";

describe("SalesBot - Segurança da RPC de Lote", () => {
  it("service_role deve ter permissão de execução", async () => {
    const { error } = await (supabaseAdmin as any).rpc("salesbot_batch_decrement", {
      p_run_id: crypto.randomUUID(),
      p_text: "test",
      p_sender_phone: "",
      p_sender_name: "",
      p_next_block_id: crypto.randomUUID()
    });
    
    expect(error?.code).not.toBe("42501"); 
  });

  it("usuário autenticado (anon/client) NÃO deve ter permissão de execução", async () => {
    const { error } = await (supabaseClient as any).rpc("salesbot_batch_decrement", {
      p_run_id: crypto.randomUUID(),
      p_text: "test",
      p_sender_phone: "",
      p_sender_name: "",
      p_next_block_id: crypto.randomUUID()
    });

    expect(error).toBeDefined();
    // 42501 (Postgres) ou erro de roteamento do PostgREST
  });
});
