import { z } from "zod";

export const leadCustomFieldInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Informe o nome do campo.").max(120),
  fieldType: z.string().trim().min(1).max(40).default("text"),
  options: z.array(z.string().trim().min(1).max(120)).max(50).default([])
    .transform(values => [...new Set(values)]),
}).superRefine((field, context) => {
  if (["select", "multiselect"].includes(field.fieldType) && !field.options.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "Adicione as opções do campo de seleção." });
  }
});

export const leadCustomFieldRecord = leadCustomFieldInput.safeExtend({ id: z.string().uuid() });
