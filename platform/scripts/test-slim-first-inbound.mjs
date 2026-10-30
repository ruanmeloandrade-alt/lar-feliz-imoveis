import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { prepareSlimInboxContactMap } from "../src/lib/slim-contact-identity.core.ts";
import {
  resolveSlimWhatsappEntry,
  dispatchSlimRecoveredCreations,
} from "../src/lib/slim-whatsapp-entry.core.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  ws = id(1),
  session = id(2),
  phone = "5522999999999";
function fixture({ missingStage = false, failPipeline = false, seed = [] } = {}) {
  const tables = {
    leads: structuredClone(seed),
    crm_sources: [{ id: id(3), workspace_id: ws, provider: "mkton", is_default: true }],
    pipelines: [
      { id: id(5), workspace_id: ws, crm_source_id: id(3), position: 2 },
      { id: id(4), workspace_id: ws, crm_source_id: id(3), position: 1 },
      { id: id(12), workspace_id: id(99), crm_source_id: id(3), position: 0 },
    ],
    pipeline_stages: missingStage
      ? []
      : [
          { id: id(7), workspace_id: ws, pipeline_id: id(4), position: 2 },
          { id: id(6), workspace_id: ws, pipeline_id: id(4), position: 1 },
        ],
  };
  let inserts = 0;
  const db = {
    tables,
    from(table) {
      let filters = [],
        orders = [],
        start = 0,
        end = 999,
        one = false,
        payload,
        operation = "read";
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          filters.push((r) => r[k] === v);
          return q;
        },
        order(k, { ascending = true } = {}) {
          orders.push([k, ascending]);
          return q;
        },
        range(a, b) {
          start = a;
          end = b;
          return q;
        },
        limit(n) {
          end = n - 1;
          return q;
        },
        insert(p) {
          operation = "insert";
          payload = p;
          return q;
        },
        update(p) {
          operation = "update";
          payload = p;
          return q;
        },
        single() {
          one = true;
          return q;
        },
        maybeSingle() {
          one = true;
          return q;
        },
        then(resolve, reject) {
          return Promise.resolve()
            .then(() => {
              if (table === "pipelines" && failPipeline)
                return { data: null, error: { message: "offline" } };
              if (operation === "insert") {
                const row = {
                  ...payload,
                  id: id(100 + ++inserts),
                  created_at: "2026-10-19T00:00:00Z",
                  updated_at: "2026-10-19T00:00:00Z",
                  merged_into_id: null,
                };
                tables[table].push(row);
                return { data: { id: row.id }, error: null };
              }
              let rows = tables[table].filter((r) => filters.every((f) => f(r)));
              if (operation === "update") for (const row of rows) Object.assign(row, payload);
              rows.sort((a, b) => {
                for (const [k, asc] of orders) {
                  if (a[k] !== b[k]) return (a[k] < b[k] ? -1 : 1) * (asc ? 1 : -1);
                }
                return 0;
              });
              rows = rows.slice(start, end + 1);
              return { data: structuredClone(one ? (rows[0] ?? null) : rows), error: null };
            })
            .then(resolve, reject);
        },
      };
      return q;
    },
  };
  return db;
}
let count = 0;
async function check(name, run) {
  await run();
  count++;
  console.log("PASS first inbound: " + name);
}
await check("primeiro funil e primeira etapa por posição, somente da empresa", async () => {
  const entry = await resolveSlimWhatsappEntry(fixture(), ws);
  assert.deepEqual(entry, { crm_source_id: id(3), pipeline_id: id(4), stage_id: id(6) });
});
await check("oi recuperado cria card visível com origem e evento pendente", async () => {
  const db = fixture();
  const result = await prepareSlimInboxContactMap(
    db,
    ws,
    new Map([
      [
        session + ":" + phone,
        [{ from_me: false, session_id: session, sender_name: "Pessoa", body: "oi" }],
      ],
    ]),
  );
  assert.equal(result.leadsCreated, 1);
  assert.equal(db.tables.leads[0].pipeline_id, id(4));
  assert.equal(db.tables.leads[0].stage_id, id(6));
  assert.equal(db.tables.leads[0].custom_data.whatsapp_session_id, session);
  assert.equal(db.tables.leads[0].custom_data.crm_created_dispatched, false);
  assert.equal(result.pendingCreated.length, 1);
  let events = [];
  await dispatchSlimRecoveredCreations(db, ws, result.pendingCreated, async (input) =>
    events.push(input),
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].stageId, id(6));
  assert.equal(events[0].eventId, "lead-created:" + db.tables.leads[0].id);
  assert.equal(db.tables.leads[0].custom_data.crm_created_dispatched, true);
  await dispatchSlimRecoveredCreations(db, ws, result.pendingCreated, async (input) =>
    events.push(input),
  );
  assert.equal(events.length, 1);
});
await check("outbound não cria card", async () => {
  const db = fixture();
  const r = await prepareSlimInboxContactMap(
    db,
    ws,
    new Map([[phone, [{ from_me: true, session_id: session }]]]),
  );
  assert.equal(r.leadsCreated, 0);
});
await check("erro ou etapa ausente não gera card invisível", async () => {
  for (const options of [{ missingStage: true }, { failPipeline: true }]) {
    const db = fixture(options);
    await assert.rejects(() =>
      prepareSlimInboxContactMap(
        db,
        ws,
        new Map([[phone, [{ from_me: false, session_id: session }]]]),
      ),
    );
    assert.equal(db.tables.leads.length, 0);
  }
});
await check("replay preserva etapa e dados existentes", async () => {
  const db = fixture({
    seed: [
      {
        id: id(50),
        workspace_id: ws,
        name: "Original",
        phone: "+" + phone,
        source: "whatsapp",
        status: "active",
        merged_into_id: null,
        created_at: "2026-10-18T00:00:00Z",
        pipeline_id: id(5),
        stage_id: id(7),
        custom_data: {
          whatsapp_session_id: session,
          crm_created_dispatched: true,
          other: "preserve",
        },
      },
    ],
  });
  const before = structuredClone(db.tables.leads);
  const r = await prepareSlimInboxContactMap(
    db,
    ws,
    new Map([[phone, [{ from_me: false, session_id: session }]]]),
  );
  assert.equal(r.pendingCreated.length, 0);
  assert.deepEqual(db.tables.leads, before);
});
await check("erro de despacho mantém evento pendente para retry", async () => {
  const db = fixture();
  const r = await prepareSlimInboxContactMap(
    db,
    ws,
    new Map([[phone, [{ from_me: false, session_id: session }]]]),
  );
  await assert.rejects(() =>
    dispatchSlimRecoveredCreations(db, ws, r.pendingCreated, async () => {
      throw Error("offline");
    }),
  );
  assert.equal(db.tables.leads[0].custom_data.crm_created_dispatched, false);
});
await check("sessão divergente não despacha nem confirma", async () => {
  const db = fixture();
  const r = await prepareSlimInboxContactMap(
    db,
    ws,
    new Map([[phone, [{ from_me: false, session_id: session }]]]),
  );
  await dispatchSlimRecoveredCreations(
    db,
    ws,
    [{ ...r.pendingCreated[0], sessionId: id(99) }],
    async () => {
      throw Error("wrong origin");
    },
  );
  assert.equal(db.tables.leads[0].custom_data.crm_created_dispatched, false);
});
await check("três origens recuperadas geram três cards e eventos independentes", async () => {
  const db = fixture();
  const sessions = [session, id(20), id(21)];
  const r = await prepareSlimInboxContactMap(
    db,
    ws,
    new Map(
      sessions.map((session_id) => [session_id + ":" + phone, [{ from_me: false, session_id }]]),
    ),
  );
  assert.equal(r.leadsCreated, 3);
  assert.equal(r.pendingCreated.length, 3);
  assert.deepEqual(
    db.tables.leads.map((l) => l.custom_data.whatsapp_session_id),
    sessions,
  );
  assert(db.tables.leads.every((l) => l.pipeline_id === id(4) && l.stage_id === id(6)));
});
await check("despacho não sobrescreve campos atualizados pelo bot", async () => {
  const db = fixture();
  const r = await prepareSlimInboxContactMap(
    db,
    ws,
    new Map([[phone, [{ from_me: false, session_id: session }]]]),
  );
  const events = [];
  await dispatchSlimRecoveredCreations(db, ws, r.pendingCreated, async (input) => {
    events.push(input.eventId);
    db.tables.leads[0].custom_data.other = "saved-by-bot";
    db.tables.leads[0].updated_at = "2026-10-19T00:01:00Z";
  });
  assert.equal(db.tables.leads[0].custom_data.other, "saved-by-bot");
  assert.equal(db.tables.leads[0].custom_data.crm_created_dispatched, false);
  await dispatchSlimRecoveredCreations(db, ws, r.pendingCreated, async (input) =>
    events.push(input.eventId),
  );
  assert.equal(events[0], events[1]);
  assert.equal(db.tables.leads[0].custom_data.crm_created_dispatched, true);
  assert.equal(db.tables.leads[0].custom_data.other, "saved-by-bot");
});
await check("dispatcher real compartilha o mesmo ID entre webhook e recuperação", async () => {
  const source = fs.readFileSync(
    new URL("../src/lib/crm-event-dispatch.server.ts", import.meta.url),
    "utf8",
  );
  const ast = ts.createSourceFile("dispatch.ts", source, ts.ScriptTarget.Latest, true);
  const node = ast.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === "dispatchCrmLeadCreated",
  );
  let js = ts
    .transpileModule(node.getText(ast), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(/^export /gm, "");
  js = js
    .replace('import("@/lib/salesbot-runtime.server")', 'imports("bots")')
    .replace('import("@/lib/stage-automation-engine.server")', 'imports("stage")');
  const events = [];
  const dispatch = new Function("imports", js + "\nreturn dispatchCrmLeadCreated;")(async (name) =>
    name === "bots"
      ? { dispatchLeadCreated: async () => {} }
      : {
          enqueueLeadAutomationEvent: async (_db, event) => {
            events.push(event);
            return [];
          },
        },
  );
  await dispatch({}, { workspaceId: ws, leadId: id(100), pipelineId: id(4), stageId: id(6) });
  await dispatch(
    {},
    {
      workspaceId: ws,
      leadId: id(100),
      pipelineId: id(4),
      stageId: id(6),
      eventId: "lead-created:" + id(100),
    },
  );
  assert.equal(events[0].eventId, events[1].eventId);
  assert.equal(events[0].event, "created");
});
await check(
  "integração gerada salva histórico antes de disparar e conserva retry em erro",
  async () => {
    const source = fs.readFileSync(
      new URL("../src/lib/leads.functions.legacy.ts", import.meta.url),
      "utf8",
    );
    const sync = source
      .split("export const syncWhatsAppInbox")[1]
      .split("export const listLeadCustomFields")[0];
    assert(sync.includes("pendingCreated"));
    assert(
      sync.includes('if (error) throw new Error("Não foi possível salvar o histórico recebido;'),
    );
    assert(
      sync.indexOf("dispatchSlimRecoveredCreations(supabaseAdmin") >
        sync.indexOf('.from("lead_activities").insert(chunk)'),
    );
  },
);
console.log(count + " checks passed");
