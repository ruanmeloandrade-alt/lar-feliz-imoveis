from pathlib import Path

path = Path('src/components/meta/MetaAudiencesPanel.tsx')
s = path.read_text()

s = s.replace(
'import { supabase } from "@/integrations/supabase/client";\n',
'import { supabase } from "@/integrations/supabase/client";\nimport { listPersonas } from "@/lib/meta-personas.functions";\nimport { listStrategies } from "@/lib/meta-strategies.functions";\n',
)

s = s.replace(
'const CREATABLE_TYPES: AudienceType[] = [\n',
'const SIMPLE_TYPES: AudienceType[] = ["website", "engagement_ig", "lead_form", "customer_list"];\n\nconst CREATABLE_TYPES: AudienceType[] = [\n',
)

s = s.replace(
'  const uploadCustomerFn = useServerFn(uploadCustomerListChunk);\n',
'  const uploadCustomerFn = useServerFn(uploadCustomerListChunk);\n  const personasFn = useServerFn(listPersonas);\n  const strategiesFn = useServerFn(listStrategies);\n',
)

s = s.replace(
'  const [open, setOpen] = useState(false);\n  const [form, setForm] = useState<Form>(defaultForm);\n',
'  const [open, setOpen] = useState(false);\n  const [showAdvanced, setShowAdvanced] = useState(false);\n  const [guideContext, setGuideContext] = useState<string>("");\n  const [form, setForm] = useState<Form>(defaultForm);\n',
)

anchor = '''  const accountsQ = useQuery({
    queryKey: ["meta-accts-for-audiences", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("meta_ad_accounts")
        .select("account_id,name,currency").eq("workspace_id", workspaceId).order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ account_id: string; name: string | null; currency: string | null }>;
    },
  });
'''
insert = anchor + '''
  const personasQ = useQuery({
    queryKey: ["audience-personas", workspaceId],
    queryFn: () => personasFn({ data: { workspaceId } }),
  });
  const strategiesQ = useQuery({
    queryKey: ["audience-strategies", workspaceId],
    queryFn: () => strategiesFn({ data: { workspaceId } }),
  });

  const guideOptions = useMemo(() => [
    ...((personasQ.data ?? []) as Array<{ id: string; name: string; ad_account_id?: string | null }>).map((p) => ({
      value: `persona:${p.id}`, label: `Persona · ${p.name}`, accountId: p.ad_account_id ?? null, name: p.name,
    })),
    ...((strategiesQ.data ?? []) as Array<{ id: string; name: string; ad_account_id?: string | null }>).map((st) => ({
      value: `strategy:${st.id}`, label: `Estratégia · ${st.name}`, accountId: st.ad_account_id ?? null, name: st.name,
    })),
  ], [personasQ.data, strategiesQ.data]);

  const applyGuideContext = (value: string) => {
    setGuideContext(value);
    const ctx = guideOptions.find((o) => o.value === value);
    if (!ctx) return;
    if (ctx.accountId) setAccountId(ctx.accountId);
    setForm((f) => ({
      ...f,
      name: f.name || `${ctx.name} · público`,
      description: f.description || `Público guiado a partir de ${ctx.label}. Revise a fonte antes de criar.`,
    }));
  };

  const applyQuickType = (type: AudienceType) => {
    const labels: Partial<Record<AudienceType, string>> = {
      website: "Visitantes do site",
      engagement_ig: "Engajados no Instagram",
      lead_form: "Leads de formulário",
      customer_list: "Lista de clientes",
    };
    setForm((f) => ({
      ...f,
      type,
      name: f.name || labels[type] || "Novo público",
      retentionDays: type === "website" ? 30 : f.retentionDays,
    }));
  };
'''
if anchor not in s:
    raise SystemExit('accountsQ anchor not found')
s = s.replace(anchor, insert, 1)

s = s.replace(
'      <Button size="sm" disabled={!accountId} onClick={() => { setForm(defaultForm); setOpen(true); }}>\n        <Plus className="w-3.5 h-3.5" /> Novo personalizado\n',
'      <Button size="sm" disabled={!accountId} onClick={() => { setForm(defaultForm); setGuideContext(""); setShowAdvanced(false); setOpen(true); }}>\n        <Plus className="w-3.5 h-3.5" /> Criar público\n',
)

marker = '''          <div className="space-y-3">
            {assetsQ.isFetching && (
'''
guide = '''          <div className="space-y-3">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
              <div>
                <div className="text-sm font-semibold">Criação guiada</div>
                <div className="text-[11px] text-muted-foreground">Comece pelo objetivo do público. Persona/Estratégia ajudam a escolher a conta e nomear o contexto; o MKTOn não inventa targeting nem altera públicos já sincronizados.</div>
              </div>
              <select
                value={guideContext}
                onChange={(e) => applyGuideContext(e.target.value)}
                className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm"
              >
                <option value="">Sem Persona/Estratégia</option>
                {guideOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                {SIMPLE_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => applyQuickType(type)}
                    className={`rounded-md border px-2 py-2 text-left text-xs hover:border-primary/60 ${form.type === type ? "border-primary bg-background" : "border-border bg-card"}`}
                  >
                    <div className="font-semibold">{TYPE_LABELS[type]}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Usar fluxo simples</div>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">Públicos já sincronizados continuam disponíveis para reutilização sem recriar.</span>
                <button type="button" className="text-[11px] font-semibold text-primary hover:underline" onClick={() => setShowAdvanced((v) => !v)}>
                  {showAdvanced ? "Ocultar avançados" : "Mais tipos"}
                </button>
              </div>
            </div>
            {assetsQ.isFetching && (
'''
if marker not in s:
    raise SystemExit('dialog marker not found')
s = s.replace(marker, guide, 1)

s = s.replace(
'                  {CREATABLE_TYPES.map((t) => (\n',
'                  {(showAdvanced ? CREATABLE_TYPES : SIMPLE_TYPES).map((t) => (\n',
1,
)

path.write_text(s)
print('task7 patch applied')
