import { describe, expect, it } from "vitest";
import {
  findLatestLeadWhatsappIdentity,
  resolveLeadEvolutionSession,
  resolveLeadWhatsappRoutingTarget,
} from "./whatsapp-session-routing.server";

type Row = Record<string, unknown>;

class FakeQuery {
  private rows: Row[];
  constructor(rows: Row[]) {
    this.rows = [...rows];
  }
  select(): this {
    return this;
  }
  eq(key: string, value: unknown): this {
    this.rows = this.rows.filter((row) => row[key] === value);
    return this;
  }
  in(key: string, values: unknown[]): this {
    this.rows = this.rows.filter((row) => values.includes(row[key]));
    return this;
  }
  order(key: string, options: { ascending: boolean }): this {
    this.rows.sort((a, b) => {
      const av = String(a[key] ?? "");
      const bv = String(b[key] ?? "");
      return options.ascending ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return this;
  }
  limit(size: number): this {
    this.rows = this.rows.slice(0, size);
    return this;
  }
  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    return { data: this.rows[0] ?? null, error: null };
  }
  then(
    onfulfilled?: ((value: { data: Row[]; error: null }) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) {
    return Promise.resolve({ data: this.rows, error: null }).then(
      onfulfilled ?? undefined,
      onrejected ?? undefined,
    );
  }
}

function fakeSupabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      return new FakeQuery(tables[table] ?? []);
    },
  };
}

describe("WhatsApp real conversation routing", () => {
  it("uses the real conversation JID even when lead.phone points to another country", async () => {
    const sb = fakeSupabase({
      lead_activities: [{
        workspace_id: "ws",
        lead_id: "lead",
        type: "message_in",
        occurred_at: "2026-09-18T10:00:00Z",
        payload: {
          whatsapp_message_id: "m1",
          whatsapp_remote_jid: "351912345678@s.whatsapp.net",
          whatsapp_session_id: "session-pt",
        },
      }],
      whatsapp_web_messages: [{
        workspace_id: "ws",
        message_id: "m1",
        remote_jid: "351912345678@s.whatsapp.net",
        to_jid: null,
        session_id: "session-pt",
        received_at: "2026-09-18T10:00:00Z",
      }],
      whatsapp_web_sessions: [
        {
          workspace_id: "ws",
          id: "session-br",
          provider: "evolution",
          status: "conectado",
          last_connected_at: "2026-09-18T10:05:00Z",
        },
        {
          workspace_id: "ws",
          id: "session-pt",
          provider: "evolution",
          status: "conectado",
          last_connected_at: "2026-09-18T10:00:00Z",
        },
      ],
    });

    const target = await resolveLeadWhatsappRoutingTarget(sb as never, {
      workspaceId: "ws",
      leadId: "lead",
      phone: "+5521999995678",
    });

    expect(target.source).toBe("conversation_jid");
    expect(target.remoteJid).toBe("351912345678@s.whatsapp.net");
    expect(target.number).toBe("351912345678");
    expect(target.sessionId).toBe("session-pt");
  });

  it("keeps the card origin despite a newer message from another number", async () => {
    const sb = fakeSupabase({
      lead_activities: [
        { workspace_id: "ws", lead_id: "lead", type: "message_in", occurred_at: "2026-10-19T12:00:00Z", payload: { whatsapp_remote_jid: "5599999999999@s.whatsapp.net", whatsapp_session_id: "session-b" } },
        { workspace_id: "ws", lead_id: "lead", type: "message_in", occurred_at: "2026-10-19T11:00:00Z", payload: { whatsapp_remote_jid: "5599999999999@s.whatsapp.net", whatsapp_session_id: "session-a" } },
      ],
      whatsapp_web_sessions: [
        { workspace_id: "ws", id: "session-a", provider: "evolution", status: "conectado", last_connected_at: "2026-10-19T10:00:00Z" },
        { workspace_id: "ws", id: "session-b", provider: "evolution", status: "conectado", last_connected_at: "2026-10-19T12:00:00Z" },
      ],
    });
    const target = await resolveLeadWhatsappRoutingTarget(sb as never, { workspaceId: "ws", leadId: "lead", phone: "+5599999999999", preferredSessionId: "session-a" });
    expect(target.sessionId).toBe("session-a");
    expect(target.conversationKey).toBe("session-a:5599999999999@s.whatsapp.net");
  });

  it("does not substitute another connected account when the original disconnects", async () => {
    const sb = fakeSupabase({
      lead_activities: [],
      whatsapp_web_sessions: [{ workspace_id: "ws", id: "session-b", provider: "evolution", status: "conectado", last_connected_at: "2026-10-19T12:00:00Z" }],
    });
    await expect(resolveLeadWhatsappRoutingTarget(sb as never, { workspaceId: "ws", leadId: "lead", phone: "+5599999999999", preferredSessionId: "session-a" })).rejects.toThrow("sessão correta");
  });

  it("routes a legacy LID message through its stored alternate phone JID", async () => {
    const sb = fakeSupabase({
      lead_activities: [
        {
          workspace_id: "ws",
          lead_id: "lead-lid",
          type: "message_in",
          occurred_at: "2026-09-18T10:00:00Z",
          payload: { whatsapp_message_id: "lid-1" },
        },
      ],
      whatsapp_web_messages: [
        {
          workspace_id: "ws",
          message_id: "lid-1",
          remote_jid: "123456789012345@lid",
          to_jid: "351912345678@s.whatsapp.net",
          session_id: "session-pt",
          received_at: "2026-09-18T10:00:00Z",
        },
      ],
      whatsapp_web_sessions: [
        {
          workspace_id: "ws",
          id: "session-pt",
          provider: "evolution",
          status: "conectado",
          last_connected_at: "2026-09-18T10:00:00Z",
        },
      ],
    });

    const target = await resolveLeadWhatsappRoutingTarget(sb as never, {
      workspaceId: "ws",
      leadId: "lead-lid",
      phone: "+351912345678",
    });

    expect(target.remoteJid).toBe("351912345678@s.whatsapp.net");
    expect(target.number).toBe("351912345678");
    expect(target.sessionId).toBe("session-pt");
  });

  it("rejects a mismatched legacy JID and falls back to the explicit lead phone", async () => {
    const sb = fakeSupabase({
      lead_activities: [{
        workspace_id: "ws",
        lead_id: "lead-old",
        type: "message_in",
        occurred_at: "2026-08-15T15:03:13Z",
        payload: { whatsapp_message_id: "legacy-wrong" },
      }],
      whatsapp_web_messages: [{
        workspace_id: "ws",
        message_id: "legacy-wrong",
        remote_jid: "5521999994119@s.whatsapp.net",
        to_jid: null,
        session_id: "session",
        received_at: "2026-08-15T15:03:13Z",
      }],
      whatsapp_web_sessions: [{
        workspace_id: "ws",
        id: "session",
        provider: "evolution",
        status: "conectado",
        last_connected_at: "2026-09-18T10:00:00Z",
      }],
    });

    const target = await resolveLeadWhatsappRoutingTarget(sb as never, {
      workspaceId: "ws",
      leadId: "lead-old",
      phone: "+5522999998971",
      preferredSessionId: "session",
    });

    expect(target.source).toBe("explicit_phone");
    expect(target.remoteJid).toBe("5522999998971@s.whatsapp.net");
  });

  it("does not silently move an existing conversation to another connected session", async () => {
    const sb = fakeSupabase({
      whatsapp_web_sessions: [
        {
          workspace_id: "ws",
          id: "session-other",
          provider: "evolution",
          status: "conectado",
          last_connected_at: "2026-09-18T10:05:00Z",
        },
      ],
    });

    await expect(resolveLeadEvolutionSession(sb as never, {
      workspaceId: "ws",
      preferredSessionId: "session-original",
    })).rejects.toThrow("não está conectado");
  });

  it(
    "fails explicitly for a local number without DDI when there is no prior conversation",
    async () => {
      const sb = fakeSupabase({
        lead_activities: [],
        whatsapp_web_messages: [],
        whatsapp_web_sessions: [
          {
            workspace_id: "ws",
            id: "session",
            provider: "evolution",
            status: "conectado",
            last_connected_at: "2026-09-18T10:00:00Z",
          },
        ],
      });

      await expect(
        resolveLeadWhatsappRoutingTarget(sb as never, {
          workspaceId: "ws",
          leadId: "lead",
          phone: "21999991234",
          preferredSessionId: "session",
        }),
      ).rejects.toThrow("ambíguo");
    },
  );

  it("preserves the group JID and the group session", async () => {
    const groupJid = "120363012345678901@g.us";
    const sb = fakeSupabase({
      lead_activities: [{
        workspace_id: "ws",
        lead_id: "group-lead",
        type: "message_in",
        occurred_at: "2026-09-18T10:00:00Z",
        payload: {
          whatsapp_message_id: "gm1",
          whatsapp_remote_jid: groupJid,
          whatsapp_session_id: "session-group",
        },
      }],
      whatsapp_web_sessions: [
        {
          workspace_id: "ws",
          id: "session-group",
          provider: "evolution",
          status: "conectado",
          last_connected_at: "2026-09-18T10:00:00Z",
        },
      ],
    });

    const identity = await findLatestLeadWhatsappIdentity(sb as never, {
      workspaceId: "ws",
      leadId: "group-lead",
    });
    expect(identity?.kind).toBe("group");

    const target = await resolveLeadWhatsappRoutingTarget(sb as never, {
      workspaceId: "ws",
      leadId: "group-lead",
      phone: groupJid,
      preferredSessionId: "session-group",
    });
    expect(target.remoteJid).toBe(groupJid);
    expect(target.number).toBe(groupJid);
    expect(target.sessionId).toBe("session-group");
  });
});
