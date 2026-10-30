import { describe, expect, it } from "vitest";
import {
  applySalesbotActivationContractTransform,
  applySalesbotCentralActivationContractTransform,
  applySalesbotSaveFeedbackTransform,
} from "../../../scripts/salesbot-save-feedback-transform";

describe("SalesBot Builder transforms", () => {
  it("turns the save button into Salvar -> Salvando -> Salvo feedback", () => {
    const source = '<button>{closing ? "Salvando…" : "Salvar"}</button>';
    const transformed = applySalesbotSaveFeedbackTransform(source);
    expect(transformed).toContain('saveStatus === "saving" ? "Salvando…"');
    expect(transformed).toContain('saveStatus === "saved" && lastSavedAt ? "Salvo ✓" : "Salvar"');
  });

  it("allows activating a Builder SalesBot without requiring a trigger", () => {
    const source = `onCheckedChange={(val: boolean) => {
        if (val && (!active?.gatilhos || active.gatilhos.length === 0)) {
          toast.error("Adicione pelo menos um gatilho antes de ativar o bot.");
          return;
        }
        updateActive((b) => ({ ...b, isActive: val }));
      }}`;
    const transformed = applySalesbotActivationContractTransform(source);
    expect(transformed).not.toContain("Adicione pelo menos um gatilho antes de ativar o bot.");
    expect(transformed).toContain("updateActive((b) => ({ ...b, isActive: val }))");
  });

  it("allows activating a SalesBot from the Central without requiring a trigger", () => {
    const source = `async function toggleActive(id: string) {
   const target = bots.find((b) => b.id === id);
   if (!target) return;
   const nextActive = !(target.isActive ?? false);
   
   // Se for ativar, confere se tem gatilhos configurados
   if (nextActive && (!target.gatilhos || target.gatilhos.length === 0)) {
     toast.error("Adicione pelo menos um gatilho antes de ativar o bot.");
     return;
   }

   const next = bots.map((b) => (b.id === id ? { ...b, isActive: nextActive } : b));
  }`;
    const transformed = applySalesbotCentralActivationContractTransform(source);
    expect(transformed).not.toContain("Adicione pelo menos um gatilho antes de ativar o bot.");
    expect(transformed).not.toContain("target.gatilhos.length === 0");
    expect(transformed).toContain("isActive: nextActive");
  });

  it("fails high when the unique save anchor disappears", () => {
    expect(() => applySalesbotSaveFeedbackTransform("<button>Salvar</button>"))
      .toThrow("anchor do botão Salvar não encontrado");
  });
});
