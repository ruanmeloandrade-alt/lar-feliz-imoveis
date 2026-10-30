import assert from "node:assert/strict";
import {
  inspect,
  matchingMessages,
  PROJECT,
  WORKSPACE,
  SESSION,
  recoveryCandidates,
  trustedLidForPhone,
} from "./operations/slim-inspect-inbound.mjs";
const phone = "5522999999999",
  jid = phone + "@s.whatsapp.net";
const message = (id, patch = {}) => ({
  key: { id, fromMe: false, remoteJid: jid },
  message: { conversation: "oi" },
  messageTimestamp: Math.floor(Date.now() / 1000) - 60,
  ...patch,
});
assert.equal(
  matchingMessages(
    [
      message("a"),
      message("other", {
        key: { id: "other", fromMe: false, remoteJid: "5511999999999@s.whatsapp.net" },
      }),
      message("out", { key: { id: "out", fromMe: true, remoteJid: jid } }),
    ],
    [phone],
  ).length,
  1,
);
assert.equal(
  matchingMessages(
    {
      messages: {
        records: [
          message("lid", {
            key: { id: "lid", fromMe: false, remoteJid: "123456789@lid", remoteJidAlt: jid },
          }),
        ],
      },
    },
    [phone],
  ).length,
  1,
);
assert.throws(() => matchingMessages({}, [phone]), /PROVIDER_SHAPE/);
const env = {
  SLIM_INBOUND_RECOVERY: "inspect",
  SLIM_INBOUND_RECOVERY_TARGETS: JSON.stringify([phone]),
  SUPABASE_URL: `https://${PROJECT}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: "synthetic",
  EVOLUTION_BASE_URL: "https://evolution.example.invalid",
  EVOLUTION_GLOBAL_API_KEY: "synthetic",
  INTEGRATION_ENCRYPTION_KEY: "synthetic",
};
let calls = 0,
  logs = [];
const fetcher = async (url, init) => {
  calls++;
  assert(init.signal);
  if (url.endsWith("/rpc/get_evolution_credentials_service")) {
    assert.equal(JSON.parse(init.body)._session_id, SESSION);
    return Response.json({
      workspace_id: WORKSPACE,
      instance_name: "isolated",
      api_key: "synthetic-scoped",
    });
  }
  if (url.includes("/rest/v1/")) {
    assert(url.includes(SESSION) && url.includes(WORKSPACE));
    return Response.json([
      { id: SESSION, provider: "evolution", status: "conectado", instance_id: "isolated" },
    ]);
  }
  const body = JSON.parse(init.body);
  assert.deepEqual(body.where.key, { remoteJid: jid, remoteJidAlt: jid });
  assert.equal(body.offset, 100);
  return Response.json({ messages: { total: 2, records: [message("a"), message("a")] } });
};
const result = await inspect(env, fetcher, (value) => logs.push(JSON.parse(value)));
assert.equal(calls, 3);
assert.equal(result.length, 1);
assert.equal(logs[0].messages[0].greeting, true);
assert(!JSON.stringify(logs).includes("synthetic"));
assert(!JSON.stringify(logs).includes(phone));
await assert.rejects(
  () => inspect({ ...env, SUPABASE_URL: "https://other.supabase.co" }, fetcher),
  /WRONG_PROJECT/,
);
await assert.rejects(
  () => inspect({ ...env, SLIM_INBOUND_RECOVERY_TARGETS: "[]" }, fetcher),
  /INVALID_TARGETS/,
);
await assert.rejects(
  () => inspect({ ...env, EVOLUTION_BASE_URL: "http://public.example.invalid" }, fetcher),
  /INSECURE_BASE/,
);
assert.equal(
  await inspect({ ...env, SLIM_INBOUND_RECOVERY: "" }, () => {
    throw Error("must not call");
  }),
  undefined,
);
let recorded = false;
await inspect(
  { ...env, SLIM_INBOUND_INSPECTION_RECORD: "1" },
  async (url, init) => {
    if (init.method === "PATCH") {
      const data = JSON.parse(init.body);
      assert.equal(data.metadata.preserved, "yes");
      assert.equal(data.metadata.slim_inbound_inspection.matched, 1);
      assert(url.includes("updated_at=eq."));
      assert(!JSON.stringify(data).includes(phone));
      assert(!JSON.stringify(data).includes("synthetic"));
      recorded = true;
      return Response.json([{ id: SESSION }]);
    }
    if (url.includes("select=metadata,updated_at"))
      return Response.json([
        { metadata: { preserved: "yes" }, updated_at: "2026-10-19T20:00:00Z" },
      ]);
    return fetcher(url, init);
  },
  () => {},
);
assert(recorded);
const since = new Date(Date.now() - 3600000).toISOString();
const original = message("recover-real");
assert.equal(
  recoveryCandidates(
    [original, original, message("out", { key: { id: "out", fromMe: true, remoteJid: jid } })],
    since,
  ).length,
  1,
);
assert.equal(recoveryCandidates([original], since)[0].message, original);
assert.throws(
  () => recoveryCandidates([original], "2020-01-01T00:00:00Z"),
  /INVALID_RECOVERY_WINDOW/,
);
let replayed = false,
  summary;
const recoveryFetch = async (url, init) => {
  if (url.includes("/rest/v1/leads?"))
    return Response.json(
      replayed
        ? [{ id: "recovered-lead", pipeline_id: "first-pipeline", stage_id: "first-stage" }]
        : [],
    );
  if (url.startsWith("https://slimesaude.com/api/public/evolution/webhook/")) {
    assert.equal(init.method, "POST");
    const payload = JSON.parse(init.body);
    assert.equal(payload.event, "messages.upsert");
    assert.equal(payload.data.key.id, "a");
    assert.equal(payload.data.message.conversation, "oi");
    assert.equal(payload.data.key.fromMe, false);
    replayed = true;
    return Response.json({ ok: true });
  }
  if (url.includes("/rest/v1/whatsapp_web_sessions?"))
    return Response.json([
      {
        id: SESSION,
        provider: "evolution",
        status: "conectado",
        instance_id: "isolated",
        webhook_secret: "synthetic-secret-more-than-twenty",
      },
    ]);
  return fetcher(url, init);
};
await inspect(
  {
    ...env,
    SLIM_INBOUND_RECOVERY_EXECUTE: "1",
    SLIM_INBOUND_RECOVERY_REQUEST_ID: "00000000-0000-4000-8000-000000000098",
    SLIM_INBOUND_RECOVERY_SINCE: since,
  },
  recoveryFetch,
  (s) => {
    summary = JSON.parse(s);
  },
);
assert(replayed);
assert.equal(summary.recovery[0].leadId, "recovered-lead");
assert.equal(summary.recovery[0].result, "recovered-real-inbound");
await inspect(
  {
    ...env,
    SLIM_INBOUND_RECOVERY_EXECUTE: "1",
    SLIM_INBOUND_RECOVERY_REQUEST_ID: "00000000-0000-4000-8000-000000000098",
    SLIM_INBOUND_RECOVERY_SINCE: since,
  },
  async (url, init) => {
    if (url.startsWith("https://slimesaude.com/api/public/evolution/webhook/"))
      throw Error("must preserve existing card without replay");
    return recoveryFetch(url, init);
  },
  (s) => {
    summary = JSON.parse(s);
  },
);
assert.equal(summary.recovery[0].result, "existing-card-preserved");
const completed = structuredClone(summary);
await inspect(
  {
    ...env,
    SLIM_INBOUND_RECOVERY_EXECUTE: "1",
    SLIM_INBOUND_RECOVERY_REQUEST_ID: "00000000-0000-4000-8000-000000000098",
    SLIM_INBOUND_RECOVERY_SINCE: since,
  },
  async (url, init) => {
    if (
      url.includes("/rest/v1/leads?") ||
      url.startsWith("https://slimesaude.com/api/public/evolution/webhook/")
    )
      throw Error("completed recovery must not touch cards");
    if (url.includes("/rest/v1/whatsapp_web_sessions?"))
      return Response.json([
        {
          id: SESSION,
          provider: "evolution",
          status: "conectado",
          instance_id: "isolated",
          webhook_secret: "synthetic-secret-more-than-twenty",
          metadata: { slim_inbound_inspection: completed },
        },
      ]);
    return fetcher(url, init);
  },
  () => {},
);
const lid = "12345678901234@lid";
assert.equal(
  trustedLidForPhone([{ number: phone, exists: true, jid, lid }], phone, [phone]).lid,
  lid,
);
assert.equal(
  trustedLidForPhone([{ number: "5511999999999", exists: true, jid, lid }], phone, [phone]),
  null,
);
assert.equal(
  trustedLidForPhone([{ number: phone, exists: false, jid, lid }], phone, [phone]),
  null,
);
assert.equal(
  trustedLidForPhone(
    [
      { number: phone, exists: true, jid: lid },
      { number: phone, exists: true, jid: lid },
    ],
    phone,
    [phone],
  ),
  null,
);
const lidResult = await inspect(
  env,
  async (url, init) => {
    if (url.includes("/chat/whatsappNumbers/")) {
      assert.deepEqual(JSON.parse(init.body), { numbers: [phone] });
      return Response.json([{ number: phone, exists: true, jid, lid }]);
    }
    if (url.includes("/chat/findMessages/")) {
      const key = JSON.parse(init.body).where.key;
      return Response.json({
        messages: {
          total: key.remoteJid === lid ? 1 : 0,
          records:
            key.remoteJid === lid
              ? [
                  message("trusted-lid", {
                    key: { id: "trusted-lid", fromMe: false, remoteJid: lid },
                  }),
                ]
              : [],
        },
      });
    }
    return fetcher(url, init);
  },
  () => {},
);
assert.equal(lidResult.length, 1);
assert.equal(lidResult[0].key.remoteJid, lid);
assert.equal(lidResult[0].key.remoteJidAlt, jid);
assert.equal(lidResult[0].message.conversation, "oi");
console.log(
  "PASS inbound inspection: scope, exact target, LID alternate, inbound only, dedupe, credentials, bounds and disabled mode",
);
