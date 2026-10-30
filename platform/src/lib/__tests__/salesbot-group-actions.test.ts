import { describe, expect, it } from "vitest";
import {
  getAdminPhonesFromEvolutionPayload,
  getSalesbotGroupJid,
  getSalesbotGroupParticipantPhone,
  normalizeEvolutionParticipantPhone,
  resolveSalesbotGroupAdminPhones,
} from "../salesbot-group-actions.server";

describe("SalesBot group action targeting", () => {
  it("usa o participante que disparou o fluxo como alvo privado", () => {
    expect(getSalesbotGroupParticipantPhone({ participante_telefone: "55 (21) 99999-0001" }))
      .toBe("5521999990001");
    expect(getSalesbotGroupParticipantPhone({ membro_telefone: "5521988880002@s.whatsapp.net" }))
      .toBe("5521988880002");
  });

  it("remove o sufixo de device do participant bruto da Evolution", () => {
    expect(normalizeEvolutionParticipantPhone("5521988880002:7@s.whatsapp.net"))
      .toBe("5521988880002");
    expect(normalizeEvolutionParticipantPhone("5521988880002@s.whatsapp.net"))
      .toBe("5521988880002");
  });

  it("não inventa alvo privado quando a run não traz participante", () => {
    expect(getSalesbotGroupParticipantPhone({})).toBeNull();
  });

  it("não transforma LID, grupo ou broadcast em telefone privado", () => {
    expect(normalizeEvolutionParticipantPhone("123456789012345@lid")).toBeNull();
    expect(normalizeEvolutionParticipantPhone("120363000000@g.us")).toBeNull();
    expect(normalizeEvolutionParticipantPhone("status@broadcast")).toBeNull();
    expect(getSalesbotGroupParticipantPhone({ participante_telefone: "123456789012345@lid" }))
      .toBeNull();
  });

  it("resolve o jid do grupo pelas variáveis e usa lead.phone como fallback", () => {
    expect(getSalesbotGroupJid("5511999999999", { group_jid: "120363000000@g.us" }))
      .toBe("120363000000@g.us");
    expect(getSalesbotGroupJid("120363111111@g.us", {})).toBe("120363111111@g.us");
  });

  it("notifica somente admins, remove duplicados e exclui o próprio número", () => {
    const phones = getAdminPhonesFromEvolutionPayload({
      participants: [
        { id: "5521999990001@s.whatsapp.net", admin: "admin" },
        { id: "5521988880002:7@s.whatsapp.net", admin: "superadmin" },
        { id: "5521977770003@s.whatsapp.net", admin: null },
        { id: "5521999990001@s.whatsapp.net", admin: "admin" },
      ],
    }, "5521999990001");

    expect(phones).toEqual(["5521988880002"]);
  });

  it("aceita payload Evolution embrulhado em group", () => {
    expect(getAdminPhonesFromEvolutionPayload({
      group: { participants: [{ id: "5511987654321@s.whatsapp.net", admin: "admin" }] },
    })).toEqual(["5511987654321"]);
  });

  it("aceita payload Evolution como array de participantes", () => {
    expect(getAdminPhonesFromEvolutionPayload([
      { id: "351912345678@s.whatsapp.net", admin: "admin" },
    ])).toEqual(["351912345678"]);
  });

  it("compara o próprio número por identidade completa, nunca por sufixo", () => {
    expect(getAdminPhonesFromEvolutionPayload({
      participants: [
        { id: "5511987654321@s.whatsapp.net", admin: "admin" },
        { id: "3511987654321@s.whatsapp.net", admin: "admin" },
      ],
    }, "5511987654321")).toEqual(["3511987654321"]);
  });

  it("ignora administrador exposto apenas como LID", () => {
    expect(getAdminPhonesFromEvolutionPayload({
      participants: [
        { id: "123456789012345@lid", admin: "admin" },
        { id: "351912345678@s.whatsapp.net", admin: "superadmin" },
      ],
    })).toEqual(["351912345678"]);
  });

  it("mantém phones vazio nos erros para o runtime tratar sem quebrar", async () => {
    const result = await resolveSalesbotGroupAdminPhones({} as never, "ws-1", "jid-invalido");
    expect(result).toEqual({ ok: false, phones: [], error: "grupo inválido" });
  });
});
