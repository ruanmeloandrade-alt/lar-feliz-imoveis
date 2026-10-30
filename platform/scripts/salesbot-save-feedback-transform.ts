const SAVE_BUTTON_ANCHOR = '{closing ? "Salvando…" : "Salvar"}';
const SAVE_BUTTON_REPLACEMENT = '{closing || saveStatus === "saving" ? "Salvando…" : saveStatus === "saved" && lastSavedAt ? "Salvo ✓" : "Salvar"}';

const BUILDER_ACTIVATION_TRIGGER_GUARD_ANCHOR = `if (val && (!active?.gatilhos || active.gatilhos.length === 0)) {
          toast.error("Adicione pelo menos um gatilho antes de ativar o bot.");
          return;
        }`;

const CENTRAL_ACTIVATION_TRIGGER_GUARD_ANCHOR = `// Se for ativar, confere se tem gatilhos configurados
   if (nextActive && (!target.gatilhos || target.gatilhos.length === 0)) {
     toast.error("Adicione pelo menos um gatilho antes de ativar o bot.");
     return;
   }`;

function replaceUnique(source: string, anchor: string, replacement: string, label: string): string {
  const first = source.indexOf(anchor);
  if (first < 0) {
    throw new Error(`[salesbot-builder] ${label} não encontrado`);
  }
  if (source.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error(`[salesbot-builder] ${label} ficou ambíguo`);
  }
  return source.replace(anchor, replacement);
}

export function applySalesbotSaveFeedbackTransform(source: string): string {
  return replaceUnique(
    source,
    SAVE_BUTTON_ANCHOR,
    SAVE_BUTTON_REPLACEMENT,
    "anchor do botão Salvar",
  );
}

export function applySalesbotActivationContractTransform(source: string): string {
  return replaceUnique(
    source,
    BUILDER_ACTIVATION_TRIGGER_GUARD_ANCHOR,
    "",
    "bloqueio de ativação por ausência de gatilho no Builder",
  );
}

export function applySalesbotCentralActivationContractTransform(source: string): string {
  return replaceUnique(
    source,
    CENTRAL_ACTIVATION_TRIGGER_GUARD_ANCHOR,
    "",
    "bloqueio de ativação por ausência de gatilho na Central",
  );
}

export function applySalesbotBuilderTransform(source: string): string {
  // A ativação revision-aware agora vive no código-fonte canônico do Builder.
  // O transform permanece apenas para o feedback visual legado do botão Salvar.
  return applySalesbotSaveFeedbackTransform(source);
}
