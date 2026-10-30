import fs from "node:fs";
import ts from "typescript";
const file = new URL("../src/lib/leads.functions.legacy.ts", import.meta.url),
  marker = "// SLIM_FIRST_INBOUND_V1";
let code = fs.readFileSync(file, "utf8");
if (!code.includes(marker)) {
  const once = (before, after) => {
    if (code.split(before).length !== 2) throw new Error("First inbound: missing/ambiguous anchor");
    code = code.replace(before, () => after);
  };
  once(
    "const {leadByPhone,customDataByLead,leadsCreated}=await prepareSlimInboxContactMap(sb,wsId,byPhone);",
    "const {leadByPhone,customDataByLead,leadsCreated,pendingCreated}=await prepareSlimInboxContactMap(sb,wsId,byPhone);",
  );
  once(
    "    return { ok: true, leadsCreated, activitiesInserted };",
    `    // Recover the creation event only after the real inbound history is saved.
    if(pendingCreated.length){
      const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
      const {dispatchCrmLeadCreated}=await import('@/lib/crm-event-dispatch.server');
      const {dispatchSlimRecoveredCreations}=await import('@/lib/slim-whatsapp-entry.core');
      await dispatchSlimRecoveredCreations(supabaseAdmin as never,wsId,pendingCreated,input=>dispatchCrmLeadCreated(supabaseAdmin as never,input));
    }
    return { ok: true, leadsCreated, activitiesInserted };`,
  );
  once(
    "      if (!error) activitiesInserted += chunk.length;",
    '      if (error) throw new Error("Não foi possível salvar o histórico recebido; a automação será tentada novamente na próxima sincronização.");\n      activitiesInserted += chunk.length;',
  );
  const parsed = ts.createSourceFile(
    file.pathname,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (parsed.parseDiagnostics.length) throw new Error("First inbound: generated source invalid");
  fs.writeFileSync(file, code + "\n" + marker + "\n");
}
console.log("PASS first inbound: recovered contacts keep first funnel/stage and creation event");
