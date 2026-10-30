import { describe, expect, it } from "vitest";
import { evaluateTrigger, matchSchedule, parseDurationMinutes, type TriggerContext } from "./agent-trigger-eval";

const ctx = (over: Partial<TriggerContext> = {}): TriggerContext => ({
  message: "",
  messageFormat: "texto",
  history: [],
  minutesSinceCustomerMessage: 0,
  now: new Date("2026-08-05T14:00:00"), // quarta, 14h
  ...over,
});

describe("horário específico", () => {
  it("liga dentro da janela e desliga fora", () => {
    expect(matchSchedule("seg-sex 09:00-18:00", new Date("2026-08-05T14:00:00"))).toBe(true);
    expect(matchSchedule("seg-sex 09:00-18:00", new Date("2026-08-05T20:00:00"))).toBe(false);
    expect(matchSchedule("seg-sex 09:00-18:00", new Date("2026-08-08T14:00:00"))).toBe(false); // sábado
  });
  it("gatilho reflete o horário real", () => {
    const v = evaluateTrigger({ trigger: "horario-especifico", custom: "seg-sex 09:00-18:00" }, ctx());
    expect(v.status).toBe("ativo");
    const fora = evaluateTrigger(
      { trigger: "horario-especifico", custom: "seg-sex 09:00-18:00" },
      ctx({ now: new Date("2026-08-05T22:30:00") }),
    );
    expect(fora.status).toBe("inativo");
  });
});

describe("tempo sem resposta", () => {
  it("converte unidades", () => {
    expect(parseDurationMinutes("30 minutos")).toBe(30);
    expect(parseDurationMinutes("2 horas")).toBe(120);
    expect(parseDurationMinutes("1 dia")).toBe(1440);
  });
  it("só ativa depois do prazo", () => {
    const w = { trigger: "nao-responde-ha", custom: "2 horas" };
    expect(evaluateTrigger(w, ctx({ minutesSinceCustomerMessage: 30 })).status).toBe("inativo");
    expect(evaluateTrigger(w, ctx({ minutesSinceCustomerMessage: 180 })).status).toBe("ativo");
  });
});

describe("formato da mensagem", () => {
  it("compara com o formato real recebido", () => {
    const w = { trigger: "formato-mensagem", subjects: ["áudio"] };
    expect(evaluateTrigger(w, ctx({ messageFormat: "áudio" })).status).toBe("ativo");
    expect(evaluateTrigger(w, ctx({ messageFormat: "texto" })).status).toBe("inativo");
  });
});

describe("cliente quer / pergunta sobre", () => {
  it("ativa quando o assunto aparece e delega à IA quando não aparece", () => {
    const w = { trigger: "cliente-quer", subjects: ["falar com agente humano"], custom: "reclamar" };
    expect(evaluateTrigger(w, ctx({ message: "quero reclamar disso" })).status).toBe("ativo");
    expect(evaluateTrigger(w, ctx({ message: "bom dia" })).status).toBe("ia");
  });
  it("toda vez que pergunta sobre preço", () => {
    const w = { trigger: "toda-vez-pergunta", subjects: ["preço"] };
    expect(evaluateTrigger(w, ctx({ message: "qual o PREÇO do plano?" })).status).toBe("ativo");
  });
});

describe("primeira vez que pergunta", () => {
  const w = { trigger: "primeira-vez-pergunta", subjects: ["prazo de entrega"] };
  it("ativa só na primeira ocorrência", () => {
    expect(evaluateTrigger(w, ctx({ message: "qual o prazo de entrega?" })).status).toBe("ativo");
    const repetido = evaluateTrigger(
      w,
      ctx({
        message: "e o prazo de entrega?",
        history: [{ role: "user", content: "qual o prazo de entrega mesmo?" }],
      }),
    );
    expect(repetido.status).toBe("inativo");
  });
});

describe("sentimento", () => {
  it("detecta negativo e positivo", () => {
    const neg = evaluateTrigger({ trigger: "sentimento", subjects: ["negativo"] }, ctx({ message: "isso é um absurdo, péssimo atendimento" }));
    expect(neg.status).toBe("ativo");
    const pos = evaluateTrigger({ trigger: "sentimento", subjects: ["positivo"] }, ctx({ message: "perfeito, adorei, obrigado!" }));
    expect(pos.status).toBe("ativo");
  });
});

describe("cliente fornece o dado", () => {
  it("reconhece e-mail, telefone e CPF", () => {
    expect(evaluateTrigger({ trigger: "cliente-fornece", subjects: ["email"] }, ctx({ message: "meu email é ruan@mkton.io" })).status).toBe("ativo");
    expect(evaluateTrigger({ trigger: "cliente-fornece", subjects: ["email"] }, ctx({ message: "não quero passar" })).status).toBe("inativo");
    expect(evaluateTrigger({ trigger: "cliente-fornece", subjects: ["telefone"] }, ctx({ message: "(31) 99999-8888" })).status).toBe("ativo");
    expect(evaluateTrigger({ trigger: "cliente-fornece", subjects: ["CPF/CNPJ"] }, ctx({ message: "123.456.789-00" })).status).toBe("ativo");
  });
  it("reconhece o nome quando o lead ainda não tem nome real", () => {
    const v = evaluateTrigger({ trigger: "cliente-fornece", subjects: ["nome"] }, ctx({ message: "Ruan Almeida", lead: { name: "Lead" } }));
    expect(v.status).toBe("ativo");
  });
});

describe("mensagem contém", () => {
  it("ignora acento e caixa", () => {
    expect(evaluateTrigger({ trigger: "mensagem-contem", custom: "reembolso" }, ctx({ message: "quero REEMBÔLSO agora" })).status).toBe("ativo");
    expect(evaluateTrigger({ trigger: "mensagem-contem", custom: "reembolso" }, ctx({ message: "quero cancelar" })).status).toBe("inativo");

  });
});
