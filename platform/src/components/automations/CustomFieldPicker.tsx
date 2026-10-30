import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listLeadCustomFields } from "@/lib/leads.functions";

export type LeadCustomField = {
  id: string;
  name: string;
  fieldType: string;
  options: string[];
};

/** Campos personalizados do workspace ativo (usado nas condições dos agentes). */
export function useLeadCustomFields() {
  const fn = useServerFn(listLeadCustomFields);
  const q = useQuery({
    queryKey: ["lead-custom-fields", "agent-conditions"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });
  return {
    fields: (q.data?.fields ?? []) as LeadCustomField[],
    isLoading: q.isLoading,
  };
}

/** Seletor do campo personalizado que será lido pela condição. */
export function CustomFieldSelect({
  value,
  onChange,
  className,
}: {
  value?: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const { fields, isLoading } = useLeadCustomFields();
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        "w-full bg-background border border-border rounded px-1.5 py-1 text-[11px]"
      }
    >
      <option value="">
        {isLoading
          ? "Carregando campos…"
          : fields.length
            ? "Escolha o campo…"
            : "Nenhum campo personalizado criado"}
      </option>
      {fields.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  );
}

/** Entrada de valor: vira lista quando o campo tem opções cadastradas. */
export function CustomFieldValueInput({
  fieldId,
  value,
  onChange,
  className,
}: {
  fieldId?: string;
  value?: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const { fields } = useLeadCustomFields();
  const def = fields.find((f) => f.id === fieldId);
  const cls =
    className ?? "w-full bg-background border border-border rounded px-1.5 py-1 text-[11px]";
  if (def && def.options.length > 0) {
    return (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">Escolha a opção…</option>
        {def.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={def?.fieldType === "number" || def?.fieldType === "money" ? "number" : "text"}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="valor do campo"
      className={cls}
    />
  );
}
