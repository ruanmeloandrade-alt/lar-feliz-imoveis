import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { parseBroadcastRotation } from "../src/lib/slim-broadcast-rotation.ts";

assert.deepEqual(parseBroadcastRotation("A\r\n\r\n B\nC", "1,5\n3"), { messages: ["A", "B", "C"], intervalsMs: [1500, 3000] });
assert.throws(() => parseBroadcastRotation(Array(51).fill("A").join("\n"), "1"));
assert.throws(() => parseBroadcastRotation("A", Array(51).fill("1").join("\n")));
for (const interval of ["0", "-1", "30", "1e1", "1,0009"]) assert.throws(() => parseBroadcastRotation("A", interval));

const uuid = (n) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, "0")}`;
const ids = [21, 22, 23, 24, 25, 26, 27].map(uuid);
const db = new PGlite({ extensions: { pgcrypto } });
const migration = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA extensions;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${uuid(1)}'::uuid$$;
    CREATE FUNCTION private.slim_workspace_access(workspace uuid, role text DEFAULT 'reader') RETURNS boolean
      LANGUAGE sql AS $$SELECT workspace = '${uuid(2)}'::uuid$$;
    CREATE TABLE public.workspaces (id uuid PRIMARY KEY);
    CREATE TABLE public.crm_lead_audiences (id uuid PRIMARY KEY, workspace_id uuid, name text);
    CREATE TABLE public.whatsapp_web_sessions (id uuid PRIMARY KEY, workspace_id uuid, provider text, status text, metadata jsonb);
    CREATE TABLE public.conversation_ai_agents (id uuid PRIMARY KEY, workspace_id uuid, enabled boolean);
    CREATE TABLE public.salesbots (id uuid PRIMARY KEY, workspace_id uuid, is_active boolean);
    CREATE TABLE public.leads (id uuid PRIMARY KEY, workspace_id uuid, name text, status text, custom_data jsonb, phone text, merged_into_id uuid);
    CREATE TABLE public.crm_automation_jobs (id uuid PRIMARY KEY, status text, started_at timestamptz, due_at timestamptz);
    INSERT INTO auth.users VALUES ('${uuid(1)}'); INSERT INTO workspaces VALUES ('${uuid(2)}'), ('${uuid(9)}');
    INSERT INTO crm_lead_audiences VALUES ('${uuid(3)}','${uuid(2)}','Público de teste');
    INSERT INTO whatsapp_web_sessions VALUES ('${uuid(4)}','${uuid(2)}','evolution','conectado','{}');
  `);
  await db.exec(migration("20261015120218_slim_durable_audience_delivery_queue.sql"));
  for (const [index, id] of ids.entries()) {
    const phone = index === 6 ? "5511999000000" : `551199900000${index}`;
    await db.query("INSERT INTO leads VALUES ($1,$2,$3,'active',$4,$5,NULL)", [id, uuid(2), `Contato ${index}`, JSON.stringify(index === 1 ? { opt_out: true } : {}), phone]);
  }
  const payload = { id: uuid(3), workspaceId: uuid(2), requestId: uuid(5), sessionId: uuid(4), kind: "text", leadIds: [ids[2], ids[1], ids[0], ...ids.slice(3)], messages: ["Primeira", "Segunda", "Terceira"], intervalsMs: [500, 1200] };
  const legacy = { ...payload, requestId: uuid(6), leadIds: [ids[0]], message: "Mensagem antiga", delayMs: 1700 };
  delete legacy.messages;
  delete legacy.intervalsMs;
  const enqueue = async (procedure, args) => (await db.query(`SELECT ${procedure}($1::jsonb) AS result`, [JSON.stringify(args)])).rows[0].result;

  const existing = await enqueue("public.slim_enqueue_audience_campaign", legacy);
  await db.exec(migration("20261113095700_vanessa_audience_rotation.sql"));
  await db.query("UPDATE slim_audience_campaigns SET next_due_at=now()+interval '1 minute' WHERE id=$1", [existing.campaignId]);

  const result = await enqueue("public.vanessa_enqueue_rotating_audience", payload);
  assert.equal(result.queued, 5);
  assert.equal(result.skipped, 2);
  assert.equal((await enqueue("public.vanessa_enqueue_rotating_audience", payload)).campaignId, result.campaignId);
  await assert.rejects(() => enqueue("public.vanessa_enqueue_rotating_audience", { ...payload, messages: ["Outra"] }), /outro conteúdo/);
  await assert.rejects(() => enqueue("public.vanessa_enqueue_rotating_audience", { ...payload, workspaceId: uuid(9) }), /Sem permissão/);
  await assert.rejects(() => enqueue("public.vanessa_enqueue_rotating_audience", { ...payload, messages: ["A\nB"] }), /por linha/);
  await assert.rejects(() => enqueue("public.vanessa_enqueue_rotating_audience", { ...payload, intervalsMs: [300] }), /intervalos/);
  const claim = async () => (await db.query("SELECT public.slim_claim_audience_delivery() AS item")).rows[0].item;
  for (const [index, lead] of [ids[2], ids[0], ids[3], ids[4], ids[5]].entries()) {
    const item = await claim();
    assert.equal(item.lead_id, lead);
    assert.equal(item.message_variant, payload.messages[index % payload.messages.length]);
    const delay = payload.intervalsMs[index % payload.intervalsMs.length];
    assert.equal(item.interval_after_ms, delay);
    const { rows } = await db.query(`SELECT round(extract(epoch FROM c.next_due_at-d.started_at)*1000)::integer AS delay
      FROM slim_audience_campaigns c JOIN slim_audience_deliveries d ON d.campaign_id=c.id WHERE d.id=$1`, [item.id]);
    assert.equal(rows[0].delay, delay);
    assert.equal(await claim(), null);
    await db.query("UPDATE slim_audience_deliveries SET status='sent' WHERE id=$1", [item.id]);
    await db.query("UPDATE slim_audience_campaigns SET next_due_at=now() WHERE id=$1", [result.campaignId]);
  }
  await db.query("UPDATE slim_audience_campaigns SET next_due_at=now() WHERE id=$1", [existing.campaignId]);
  const oldItem = await claim();
  assert.equal(oldItem.campaign.message, "Mensagem antiga");
  assert.equal(oldItem.interval_after_ms, null);
  assert.equal(oldItem.campaign.delay_ms, 1700);
  const privileges = await db.query(`SELECT has_function_privilege('anon','public.vanessa_enqueue_rotating_audience(jsonb)','EXECUTE') AS anonymous_send,
    has_function_privilege('authenticated','public.slim_claim_audience_delivery()','EXECUTE') AS user_claim`);
  assert.deepEqual(privileges.rows[0], { anonymous_send: false, user_claim: false });
  console.log("PASS rotação real no PostgreSQL: ordem, ciclos, intervalo, deduplicação, opt-out, repetição idempotente, permissões e fila antiga.");
} finally {
  await db.close();
}
