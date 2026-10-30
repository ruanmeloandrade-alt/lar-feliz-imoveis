// Helpers para o autocomplete de variáveis nos blocos de mensagem
// (Salesbot, comentários, DMs, transmissões etc.).

export type VariableItem = {
  /** Token que será inserido entre chaves duplas. Ex.: `nome`, `campo:aniversario`. */
  token: string;
  /** Rótulo humano exibido no seletor. */
  label: string;
  /** Grupo do item (ex.: "Lead", "Campos personalizados"). */
  group: string;
  /** Descrição curta opcional. */
  hint?: string;
};

/** Slugify PT-BR safe (sem acentos, minúsculo, `_` entre palavras). */
export function slugifyVar(input: string): string {
  return (input ?? "")
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Itens fixos disponíveis em todo bloco de mensagem. */
export const LEAD_VARIABLES: VariableItem[] = [
  { token: "nome", label: "Nome do lead", group: "Lead", hint: "Nome cadastrado no CRM" },
  { token: "email", label: "E-mail do lead", group: "Lead" },
  { token: "telefone", label: "Telefone do lead", group: "Lead" },
];

/** Monta a lista completa a partir dos campos personalizados carregados. */
export function buildVariableCatalog(
  customFields: Array<{ id: string; name: string }>,
): VariableItem[] {
  const cf: VariableItem[] = customFields.map((f) => ({
    token: `campo:${slugifyVar(f.name)}`,
    label: f.name,
    group: "Campos personalizados",
    hint: `campo:${slugifyVar(f.name)}`,
  }));
  return [...LEAD_VARIABLES, ...cf];
}

/**
 * Dado o valor do textarea e a posição do cursor, retorna o "query" ativo
 * quando o cursor está imediatamente após um `{{` (ou um `(`) aberto e ainda
 * sem fechamento. O parêntese é o atalho para puxar campo personalizado.
 */
export function detectVarQuery(
  value: string,
  caret: number,
): { open: number; query: string } | null {
  if (caret <= 0) return null;
  const before = value.slice(0, caret);

  const braceIdx = before.lastIndexOf("{{");
  const parenIdx = before.lastIndexOf("(");

  if (braceIdx >= 0 && braceIdx > parenIdx) {
    // Se houver um fechamento entre o `{{` e o cursor, não estamos mais dentro.
    const between = before.slice(braceIdx + 2);
    if (between.includes("}}") || /[\n]/.test(between)) return null;
    // Aceita letras, números, `_`, `:`, `.`, `-` e espaço no filtro.
    if (!/^[\w:.\- ]*$/.test(between)) return null;
    return { open: braceIdx, query: between };
  }

  if (parenIdx >= 0) {
    const between = before.slice(parenIdx + 1);
    if (between.includes(")") || /\n/.test(between)) return null;
    // Sem espaços, para não abrir o seletor em parênteses de texto normal.
    if (!/^[\w:.\-]*$/.test(between)) return null;
    return { open: parenIdx, query: between };
  }

  return null;
}


/** Filtra itens do catálogo dado um query (case/acento-insensível). */
export function filterVariableCatalog(
  catalog: VariableItem[],
  query: string,
): VariableItem[] {
  const q = slugifyVar(query);
  if (!q) return catalog;
  return catalog.filter((it) => {
    return (
      slugifyVar(it.label).includes(q) ||
      slugifyVar(it.token).includes(q)
    );
  });
}

/* ============================ Menções (grupos) ============================ */

/**
 * Menções disponíveis apenas em bots/agentes de escopo "grupo".
 * O token é inserido no texto como `{@token}` e o runtime converte em uma
 * menção real do WhatsApp (o número entra no array `mentioned` do envio).
 */
export const MENTION_ITEMS: VariableItem[] = [
  { token: "todos", label: "@todos — todo mundo do grupo", group: "Menção", hint: "Menciona todos os participantes" },
  { token: "admins", label: "@admins — todos os administradores", group: "Menção", hint: "Menciona só quem é admin do grupo" },
  { token: "bemvindo", label: "@bem-vindo — quem acabou de entrar", group: "Menção", hint: "Marca o participante que entrou no grupo" },
  { token: "participante", label: "@participante — quem enviou a mensagem", group: "Menção", hint: "Marca no grupo quem falou por último" },
  { token: "membro", label: "@membro — membro do evento (entrou/saiu/promovido)", group: "Menção", hint: "Marca o participante que disparou o gatilho" },
  { token: "lead", label: "@lead — lead do CRM", group: "Menção", hint: "Marca o telefone salvo no lead" },
];

/**
 * Detecta uma menção aberta: `@` (preferido) ou `{` — e não `{{`, que é
 * variável. Retorna a posição de abertura e o filtro digitado.
 */
export function detectMentionQuery(
  value: string,
  caret: number,
): { open: number; query: string } | null {
  if (caret <= 0) return null;
  const before = value.slice(0, caret);

  const atIdx = before.lastIndexOf("@");
  const braceIdx = before.lastIndexOf("{");

  // `@` só abre menção no começo do texto ou depois de espaço/quebra de linha.
  const atValid =
    atIdx >= 0 &&
    (atIdx === 0 || /[\s(]/.test(before[atIdx - 1] ?? "")) &&
    !before.slice(atIdx + 1).match(/[\s}]/);

  if (atValid && atIdx > braceIdx) {
    const q = before.slice(atIdx + 1);
    if (!/^[\w.\-]*$/.test(q)) return null;
    return { open: atIdx, query: q };
  }

  const openIdx = braceIdx;
  if (openIdx < 0) return null;
  // `{{` é variável, não menção.
  if (before[openIdx - 1] === "{") return null;
  if (before[openIdx + 1] === "{") return null;
  const between = before.slice(openIdx + 1);
  if (between.includes("}") || /\n/.test(between)) return null;
  const q = between.startsWith("@") ? between.slice(1) : between;
  if (!/^[\w.\-]*$/.test(q)) return null;
  return { open: openIdx, query: q };
}


/** Filtra menções: itens fixos + número digitado manualmente. */
export function filterMentionCatalog(
  extra: VariableItem[],
  query: string,
): VariableItem[] {
  const all = [...MENTION_ITEMS, ...extra];
  const digits = query.replace(/\D/g, "");
  const manual: VariableItem[] =
    digits.length >= 8
      ? [{ token: digits, label: `Marcar +${digits}`, group: "Menção", hint: "Número digitado" }]
      : [];
  const q = slugifyVar(query);
  const filtered = q ? all.filter((it) => slugifyVar(it.label).includes(q) || slugifyVar(it.token).includes(q)) : all;
  return [...manual, ...filtered];
}
