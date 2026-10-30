/**
 * Campos alvo/origem do bloco "Definir campo" do Salesbot.
 * Prefixos usados nas referências:
 *  - `lead:<coluna>`     → coluna nativa da tabela de leads
 *  - `empresa:<coluna>`  → coluna nativa da empresa vinculada ao lead
 *  - `<uuid>`            → campo personalizado (mantém compatibilidade com bots antigos)
 */

export type FieldEntity = "lead" | "empresa";

export interface BuiltinField {
 ref: string;
 column: string;
 label: string;
 fieldType: string;
}

export const LEAD_BUILTIN_FIELDS: BuiltinField[] = [
 { ref: "lead:name", column: "name", label: "Nome", fieldType: "text" },
 { ref: "lead:email", column: "email", label: "E-mail", fieldType: "email" },
 { ref: "lead:phone", column: "phone", label: "Telefone / WhatsApp", fieldType: "phone" },
 { ref: "lead:value", column: "value", label: "Valor da venda", fieldType: "money" },
 { ref: "lead:company_role", column: "company_role", label: "Cargo na empresa", fieldType: "text" },
 { ref: "lead:source", column: "source", label: "Origem", fieldType: "text" },
];

export const COMPANY_BUILTIN_FIELDS: BuiltinField[] = [
 { ref: "empresa:name", column: "name", label: "Nome da empresa", fieldType: "text" },
 { ref: "empresa:cnpj", column: "cnpj", label: "CNPJ", fieldType: "text" },
 { ref: "empresa:phone", column: "phone", label: "Telefone", fieldType: "phone" },
 { ref: "empresa:site", column: "site", label: "Site", fieldType: "url" },
 { ref: "empresa:notes", column: "notes", label: "Observações", fieldType: "textarea" },
];

export function builtinFor(ref: string): BuiltinField | undefined {
 return [...LEAD_BUILTIN_FIELDS, ...COMPANY_BUILTIN_FIELDS].find((f) => f.ref === ref);
}

export function entityOfRef(ref: string): FieldEntity {
 return ref.startsWith("empresa:") ? "empresa" : "lead";
}

export function isBuiltinRef(ref: string): boolean {
 return ref.startsWith("lead:") || ref.startsWith("empresa:");
}
