import { describe, expect, it } from "vitest";
import {
  buildContactIdentityIndex,
  createSlimCanonicalContact,
  prepareSlimInboxContactMap,
  whatsappContactKey,
  type IdentityContact,
} from "./slim-contact-identity.core";
import { deliverAudienceItem, type DeliveryDependencies } from "./slim-audience-delivery.core";

const ws = "00000000-0000-4000-8000-000000000100";
const phone = "5599999999999";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sessions = [id(201), id(202), id(203)];
function contact(n: number, sessionId: string, source = "whatsapp"): IdentityContact {
  return {
    id: id(n),
    workspace_id: ws,
    name: "Isolated client",
    phone: "+" + phone,
    source,
    status: "active",
    merged_into_id: null,
    created_at: `2026-10-${String(n).padStart(2, "0")}T00:00:00Z`,
    custom_data: { whatsapp_session_id: sessionId },
  };
}

function memoryDb(initial: IdentityContact[] = []) {
  const rows = structuredClone(initial);
  let inserts = 0;
  return {
    rows,
    from(table: string) {
      let filtered: Record<string, unknown>[] =
        table === "leads"
          ? [...rows]
          : [{ id: id(50), workspace_id: ws, is_default: true, provider: "manual" }];
      let payload: Record<string, unknown> | undefined;
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filtered = filtered.filter((row) => row[key] === value);
          return query;
        },
        order() {
          return query;
        },
        range(start: number, end: number) {
          filtered = filtered.slice(start, end + 1);
          return query;
        },
        insert(data: Record<string, unknown>) {
          payload = data;
          return query;
        },
        async single() {
          const row = {
            ...payload,
            id: id(1000 + ++inserts),
            created_at: new Date().toISOString(),
            merged_into_id: null,
          } as IdentityContact;
          rows.push(row);
          return { data: { id: row.id }, error: null };
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data: filtered, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
}

describe("WhatsApp: atendimento separado por número", () => {
  it("mantém três cards e três famílias independentes para o mesmo telefone", () => {
    const rows = sessions.map((session, index) => contact(index + 1, session));
    const index = buildContactIdentityIndex(rows, ws);
    sessions.forEach((session, n) => {
      expect(index.forPhone(phone, session)?.id).toBe(id(n + 1));
      expect(index.resolve(id(n + 1))).toBe(id(n + 1));
      expect(index.family(id(n + 1))).toEqual([id(n + 1)]);
    });
    expect(() => index.forPhone(phone)).toThrow("mais de um WhatsApp");
  });
  it("um alias de pedido só pertence ao atendimento da mesma origem", () => {
    const rows = [
      contact(1, sessions[0]),
      contact(2, sessions[1]),
      contact(3, sessions[1], "pedido_saude_slim"),
    ];
    const index = buildContactIdentityIndex(rows, ws);
    expect(index.family(id(1))).toEqual([id(1)]);
    expect(index.family(id(2))).toEqual([id(2), id(3)]);
  });
  it("cria três cards, preserva estados existentes e não duplica replay da mesma sessão", async () => {
    const db = memoryDb();
    const results = await Promise.all(
      sessions.flatMap((sessionId) =>
        Array.from({ length: 5 }, () =>
          createSlimCanonicalContact(db, ws, {
            name: "Same client",
            phone: "+" + phone,
            source: "whatsapp",
            custom_data: { whatsapp_session_id: sessionId },
          }),
        ),
      ),
    );
    expect(db.rows).toHaveLength(3);
    expect(new Set(results.map((result) => result.id)).size).toBe(3);
    expect(results.filter((result) => result.created)).toHaveLength(3);
    db.rows[0].stage_id = id(900);
    const next = await createSlimCanonicalContact(db, ws, {
      name: "Replay",
      phone: "+" + phone,
      source: "whatsapp",
      custom_data: { whatsapp_session_id: sessions[0] },
    });
    expect(next.created).toBe(false);
    expect(db.rows[0].stage_id).toBe(id(900));
  });
  it("backfill não mistura três lotes de conversas do mesmo cliente", async () => {
    const db = memoryDb(sessions.map((s, i) => contact(i + 1, s)));
    const result = await prepareSlimInboxContactMap(
      db,
      ws,
      new Map(
        sessions.map((session_id) => [
          whatsappContactKey(phone, session_id),
          [{ session_id, from_me: false, sender_name: "Same client" }],
        ]),
      ),
    );
    expect(result.leadsCreated).toBe(0);
    sessions.forEach((session, n) =>
      expect(result.leadByPhone.get(whatsappContactKey(phone, session))).toBe(id(n + 1)),
    );
  });
  it("recusa lote de sincronização contendo mensagens de duas origens", async () => {
    const db = memoryDb();
    await expect(
      prepareSlimInboxContactMap(
        db,
        ws,
        new Map([
          [
            phone,
            [
              { session_id: sessions[0], from_me: false },
              { session_id: sessions[1], from_me: false },
            ],
          ],
        ]),
      ),
    ).rejects.toThrow("misturar");
    expect(db.rows).toHaveLength(0);
  });
});

describe("remarketing pela origem do card", () => {
  for (const origin of sessions)
    it(`envia pela origem ${origin} e nunca pela campanha padrão`, async () => {
      let sent = 0;
      let used = "";
      const deps: DeliveryDependencies = {
        workspaceId: ws,
        campaign: { kind: "text", message: "Olá" },
        allowed: async () => true,
        lead: async () => ({ ...contact(1, origin), workspace_id: ws }),
        normalizePhone: () => ({ ok: true, digits: phone }),
        session: async (lead) => ({
          id: String(lead.custom_data.whatsapp_session_id),
          workspace_id: ws,
          status: "conectado",
          instance_name: "isolated",
          api_key: "isolated",
        }),
        activateAgent: async () => ({
          allowed: true,
          continue: async () => true,
          rollback: async () => {},
        }),
        startBot: async () => null,
        send: async (session) => {
          sent++;
          used = String(session.id);
          return { ok: true, status: 200, messageId: "isolated-receipt" };
        },
        persist: async () => {},
      };
      expect((await deliverAudienceItem(deps)).state).toBe("sent");
      expect(sent).toBe(1);
      expect(used).toBe(origin);
      deps.session = async () => ({
        id: "wrong-number",
        workspace_id: ws,
        status: "conectado",
        instance_name: "isolated",
        api_key: "isolated",
      });
      expect((await deliverAudienceItem(deps)).code).toBe("ORIGIN_MISMATCH");
      expect(sent).toBe(1);
    });
});
