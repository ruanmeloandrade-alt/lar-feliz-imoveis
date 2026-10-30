import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const MARK = '// SLIM_DASHBOARD_DATA_CONTRACT_V1';
const plans = [];
let modifications = 0;
function edit(path, transform) {
  const before = readFileSync(new URL(path, root), 'utf8');
  if (before.includes(MARK)) return;
  let code = before;
  const once = (from, to, label) => {
    // Do not modify the similarly named condition in the preferences editor.
    if (label === 'forms unavailable') {
      const start = code.indexOf('<Panel widgetId="forms"');
      const end = code.indexOf('</Panel>', start);
      if (start < 0 || end < 0) throw new Error('Forms widget anchor missing');
      const panel = code.slice(start, end);
      if (panel.split(from).length - 1 !== 1) throw new Error('Forms widget condition changed');
      code = code.slice(0, start) + panel.replace(from, () => to) + code.slice(end);
      modifications++; return;
    }
    const hits = typeof from === 'string' ? code.split(from).length - 1 : [...code.matchAll(new RegExp(from.source, from.flags.includes('g') ? from.flags : from.flags + 'g'))].length;
    if (hits !== 1) throw new Error(`[Slim dashboard] ${path}: ${label} expected 1 anchor, found ${hits}`);
    code = code.replace(from, () => to); modifications++;
  };
  transform(once);
  plans.push([path, `${MARK}\n${code}`]);
}
const imports = 'import { readDashboardRows, readDashboardRpc, dashboardIssues, classifyDashboardLead, type DashboardIssue } from "@/lib/slim-dashboard-data.core";\n';
const call = (ws,table,cols,options='') => `readDashboardRows(sb, ${ws}, "${table}", "${cols}"${options ? ', '+options : ''})`;

edit('src/lib/dashboard.functions.ts',(once)=>{
  once('import { createServerFn }', imports+'import { createServerFn }','imports');
  once('type DbLead = {\n id: string;', 'type DbLead = {\n status?: string;\n id: string;', 'lead status type');
  once(/ const \[\{ data: pipelines, error: pipelinesError \}, \{ data: stages, error: stagesError \}, \{ data: leads, error: leadsError \}\] = await Promise\.all\(\[[\s\S]*?\n \]\);/,
` const [{ data: pipelines, error: pipelinesError }, { data: stages, error: stagesError }, { data: leads, error: leadsError }] = await Promise.all([
 ${call('wsId','pipelines','id, name, position')},
 ${call('wsId','pipeline_stages','id, pipeline_id, name, position')},
 ${call('wsId','leads','id, status, pipeline_id, stage_id, name, email, phone, value, external_id, external_updated_at, last_message_from, tags, created_at, updated_at')},
 ]);`, 'primary reads');
  once('const pipelineRows = (pipelines?? []) as DbPipeline[];', 'const pipelineRows = ((pipelines?? []) as DbPipeline[]).sort((a,b)=>(a.position??0)-(b.position??0));','pipeline order');
  once('const stageRows = ((stages?? []) as DbStage[]).filter((stage) => pipelineIds.has(stage.pipeline_id));', 'const stageRows = ((stages?? []) as DbStage[]).filter((stage) => pipelineIds.has(stage.pipeline_id)).sort((a,b)=>(a.position??0)-(b.position??0));', 'stage order');
  once(/ function classify\(lead: DbLead\): "won" \| "lost" \| "open" \{[\s\S]*?\n \}/,
' function classify(lead: DbLead): "won" | "lost" | "open" {\n   return classifyDashboardLead(lead, stageById.get(lead.stage_id ?? "")?.name, rules);\n }', 'main classification');
  once(/ const \[leadsRes, pipelinesRes, stagesRes, fieldsRes, customValuesRes, tasksRes, companiesRes\] = await Promise\.all\(\[[\s\S]*?\n \]\);/,
` const [leadsRes, pipelinesRes, stagesRes, fieldsRes, customValuesRes, tasksRes, companiesRes] = await Promise.all([
 ${call('wsId','leads','id, status, pipeline_id, stage_id, value, tags, created_at')},
 ${call('wsId','pipelines','id, name')},
 ${call('wsId','pipeline_stages','id, pipeline_id, name')},
 ${call('wsId','lead_custom_fields','id, name, field_type','{ optional: true }')},
 ${call('wsId','lead_custom_field_values','lead_id, field_id, value','{ optional: true }')},
 ${call('wsId','tasks','id, status, start_at','{ optional: true }')},
 ${call('wsId','companies','id')},
 ]);
 for (const result of [leadsRes, pipelinesRes, stagesRes, companiesRes]) {
   if (result.error) throw new Error(result.error.message);
 }`, 'custom KPI reads');
  once(/ function classify\(lead: \{ pipeline_id: string \| null; stage_id: string \| null \}\): "won" \| "lost" \| "open" \{[\s\S]*?\n \}/,
' function classify(lead: { status?: string; pipeline_id: string | null; stage_id: string | null }): "won" | "lost" | "open" {\n   return classifyDashboardLead(lead, stageById.get(lead.stage_id ?? "")?.name, data);\n }', 'custom classification');
  once(' const cards = keys.map((key): KpiCardData => {',` const cards = keys.map((key): KpiCardData => {
  const optionalIssue = key.includes("tasks_") ? tasksRes.issue
    : /(?:custom_field|mkton\\.field\\.)/.test(key) ? (fieldsRes.issue ?? customValuesRes.issue) : undefined;
  if (optionalIssue) return { ...emptyKpi(key, humanizeKpiKey(key), "count", optionalIssue.message), source_label: sourceLabel };`, 'optional KPI null states');
});

edit('src/lib/dashboard-v4-live.functions.ts',(once)=>{
  once('import { createServerFn }',imports+'import { createServerFn }','imports');
  once('type LeadRow = {\n  id: string;', 'type LeadRow = {\n  status?: string;\n  id: string;', 'lead status');
  once('export type DashboardV4LiveResponse = {',`export type DashboardV4LiveResponse = {
  issues?: DashboardIssue[];
  availability?: { forms: boolean; customFields: boolean; tracking: boolean };`, 'availability contract');
  const arr = [
    ['pipelines','id, name, position'],['pipeline_stages','id, pipeline_id, name, position'],
    ['leads','id, status, pipeline_id, stage_id, company_id, value, tags, created_at'],
    ['companies','id, name, created_at'],['product_catalogs','id, name'],['products','id, catalog_id, name, price, promo_price, stock, active, category'],
    ['crm_forms','id, nome, origem',true],['crm_form_submissions','id, form_id, lead_id, created_at',true],
    ['lead_custom_fields','id, name',true],['lead_custom_field_values','lead_id, field_id, value',true],['tracking_sites','id, verified',true],
  ];
  once(/    \] = await Promise\.all\(\[[\s\S]*?\n    \]\);/,
`    ] = await Promise.all([
${arr.map(([t,c,o])=>'      '+call('workspaceId',t,c,o?'{ optional: true }':'')+',').join('\n')}
      readDashboardRpc(sb, workspaceId, "tracking_overview", { _days: 7 }),
    ]);`, 'independent V4 sources');
  once(/    const classify = \(lead: LeadRow\): "won" \| "lost" \| "open" => \{[\s\S]*?\n    \};/,
'    const classify = (lead: LeadRow): "won" | "lost" | "open" => classifyDashboardLead(lead, stageById.get(lead.stage_id ?? "")?.name, rules);', 'V4 classification');
  once('  events24h: number;', '  events24h: number | null;', 'no invented 24h event count');
  once('  sessions24h: number;', '  sessions24h: number | null;', 'no invented 24h sessions');
  once('        events24h: 0,', '        events24h: null,', '24h requires an actual measurement');
  once('        sessions24h: 0,', '        sessions24h: null,', '24h requires its own measurement');
  once('if (!tracking7Res.error && tracking7Res.data) {', 'if (!tracking7Res.error && !sitesRes.issue && tracking7Res.data) {', 'tracking dependency state');
  once('    return {\n      companies,',`    return {
      issues: dashboardIssues(formsRes, submissionsRes, fieldsRes, fieldValuesRes, sitesRes, tracking7Res),
      availability: {
        forms: !formsRes.issue && !submissionsRes.issue,
        customFields: !fieldsRes.issue && !fieldValuesRes.issue,
        tracking: !sitesRes.issue && !tracking7Res.issue && Boolean(tracking7Res.data),
      },
      companies,`, 'expose source status');
});

edit('src/lib/dashboard-v4-product-sales.functions.ts',(once)=>{
  once('import { createServerFn }',imports+'import { createServerFn }','imports');
  once('type LeadRow = {\n  id: string;','type LeadRow = {\n  status?: string;\n  id: string;','status type');
  once(/    const \[stagesRes, leadsRes, productsRes, catalogsRes\] = await Promise\.all\(\[[\s\S]*?\n    \]\);/,
`    const [stagesRes, leadsRes, productsRes, catalogsRes] = await Promise.all([
      ${call('workspaceId','pipeline_stages','id,name')},
      ${call('workspaceId','leads','id,status,pipeline_id,stage_id,value')},
      ${call('workspaceId','products','id,catalog_id,name')},
      ${call('workspaceId','product_catalogs','id,name')},
    ]);`,'product inputs');
  once(/    let linksRes = await sb[\s\S]*?\.limit\(20000\);/,
`    let linksRes = await ${call('workspaceId','lead_products','lead_id,product_id,quantity,unit_price,sold_at,created_at','{ purchased: true }')};`,'purchase pagination');
  once('    if (linksRes.error) {\n      schemaReady = false;',`    if (linksRes.error && !["42703", "PGRST204"].includes(linksRes.error.code)) throw new Error(linksRes.error.message);
    if (linksRes.error) {
      schemaReady = false;`,'fallback only on missing columns');
  once(/      linksRes = await sb[\s\S]*?\.limit\(20000\);/,
`      linksRes = await ${call('workspaceId','lead_products','lead_id,product_id,created_at','{ purchased: true }')};`,'legacy pagination');
  once(/    const classify = \(lead: LeadRow\): "won" \| "lost" \| "open" => \{[\s\S]*?\n    \};/,
'    const classify = (lead: LeadRow): "won" | "lost" | "open" => classifyDashboardLead(lead, stageById.get(lead.stage_id ?? ""), data);','product classification');
});

edit('src/routes/painel.tsx',(once)=>{
  once('import { MOCK_METRICS, type DrilldownLead, type KpiCardData } from "@/lib/mock-dashboard";',
'import type { DrilldownLead, KpiCardData } from "@/lib/mock-dashboard";\nimport { refreshEnabledDashboardQueries } from "@/lib/slim-dashboard-data.core";','remove mock fallback import');
  once('  const metrics = dashboard?.metrics ?? MOCK_METRICS;', '  const metrics = dashboard?.metrics;', 'remove mock fallback');
  once('  function handleCockpitClick(event: ReactMouseEvent<HTMLDivElement>) {', '  function handleCockpitClick(event: ReactMouseEvent<HTMLDivElement>) {\n    if (!metrics || dashboardQuery.error) return;', 'guard unready metrics');
  once('  const liveData = mergeTrackingOverview(v4LiveQuery.data, trackingQuery.data);', '  const liveData = mergeTrackingOverview(v4LiveQuery.error ? undefined : v4LiveQuery.data, trackingQuery.error ? undefined : trackingQuery.data);','do not render failed optional data');
  once('  const syncBusy =',`  const refreshDashboard = () => refreshEnabledDashboardQueries([
    { enabled: true, refetch: () => dashboardQuery.refetch() },
    { enabled: true, refetch: () => v4LiveQuery.refetch() },
    { enabled: true, refetch: () => productSalesQuery.refetch() },
    { enabled: !trackingModule.loading && trackingModule.hasAccess && Boolean(workspaceQuery.data?.id), refetch: () => trackingQuery.refetch() },
    { enabled: showTraffic, refetch: () => mediaQuery.refetch() },
    { enabled: showSocial || showWorkflow, refetch: () => operationsQuery.refetch() },
  ]);
  const syncBusy =`, 'guard refresh');
  once('onSync={() => Promise.all([dashboardQuery.refetch(), v4LiveQuery.refetch(), productSalesQuery.refetch(), trackingQuery.refetch(), mediaQuery.refetch(), operationsQuery.refetch()])}', 'onSync={refreshDashboard}', 'use guarded refresh');
  once('          <div className="p-5 space-y-5">',`          <div className="p-5 space-y-5">
            {metrics && !dashboardQuery.error && metrics.read_status !== "error" ? <>`, 'loading guard start');
  once('            <div id="printable-area" className="space-y-5">',`            {!!liveData?.issues?.length && <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <p className="font-medium">O painel comercial foi carregado. Estas fontes ainda precisam de atenção:</p>
              {liveData.issues.map((issue) => <p key={issue.source} className="mt-1">{issue.message}</p>)}
            </div>}
            <div id="printable-area" className="space-y-5">`, 'visible source incidents');
  once('productSales={productSalesQuery.data}', 'productSales={productSalesQuery.error ? undefined : productSalesQuery.data}', 'product failure is not empty');
  once('            </div>\n          </div>\n        </div>\n      </main>',`            </div>
            </> : <div className="rounded-xl border border-border p-6" role={dashboardQuery.error || dashboard?.syncError ? "alert" : "status"}>
              <h1 className="text-xl font-semibold">Dashboard detalhada</h1>
              <p className="mt-3 text-sm">{dashboardQuery.error || dashboard?.syncError ? "Não foi possível carregar os dados comerciais. Nenhum indicador foi calculado a partir dessa falha." : "Carregando os dados reais da operação..."}</p>
              {(dashboardQuery.error || dashboard?.syncError) && <button type="button" className="mt-4 rounded-md border border-border px-4 py-2 text-sm" onClick={refreshDashboard}>Tentar novamente</button>}
            </div>}
          </div>
        </div>
      </main>`, 'loading guard end');
});

edit('src/components/dashboard/DashboardV4ConfigurableBoard.tsx',(once)=>{
  const empty = (title,text) => `<EmptyState title="${title}" text="${text}" />`;
  once('{products.length ?',`{!liveData ? ${empty('Dados do catálogo indisponíveis','Aguarde o carregamento ou sincronize novamente.')} : products.length ?`, 'catalog no fake empty');
  once('{productSaleRows.length ?',`{!productSales ? ${empty('Dados de vendas por produto indisponíveis','A leitura precisa ser concluída antes de calcular este ranking.')} : productSaleRows.length ?`, 'sales no fake empty');
  once('{companies.length ?',`{!liveData ? ${empty('Dados de empresas indisponíveis','Aguarde o carregamento ou sincronize novamente.')} : companies.length ?`, 'companies no fake empty');
  once('{forms.length ?',`{!liveData || liveData.availability?.forms === false ? ${empty('Dados de formulários indisponíveis','Os envios ainda não puderam ser consultados. Isso não significa zero envios.')} : forms.length ?`, 'forms unavailable');
  once('{tags.length ?',`{!liveData ? ${empty('Dados de tags indisponíveis','Aguarde o carregamento ou sincronize novamente.')} : tags.length ?`, 'tags no fake empty');
  once('{customFields.length ?',`{!liveData || liveData.availability?.customFields === false ? ${empty('Campos personalizados indisponíveis','A fonte de campos precisa ser corrigida. Não foram calculados valores zerados.')} : customFields.length ?`, 'fields unavailable');
});

// All anchors have been checked before any source is written.
for (const [path,code] of plans) writeFileSync(new URL(path,root),code);
console.log(`[Slim dashboard] ${plans.length} source files patched; ${modifications} checked edits. Existing widgets and routes preserved.`);
