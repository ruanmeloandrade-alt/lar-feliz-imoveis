// Bounded inspection and explicitly enabled recovery of real inbound messages.
// Credentials remain inside the existing server; no message is synthesized.
export const PROJECT = "vyzvfcgpjjzvcjegzzza";
export const WORKSPACE = "c49945db-1960-461a-9339-a43b8403bdd9";
export const SESSION = "ee50c7dd-c400-4dfd-916a-3869f1311d33";
export function records(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.messages?.records)) return value.messages.records;
  throw new Error("PROVIDER_SHAPE");
}
export function matchingMessages(value, phones) {
  const allowed = new Set(phones.map((p) => p + "@s.whatsapp.net"));
  return records(value)
    .filter(
      (m) =>
        m?.key?.fromMe === false &&
        typeof m.key.id === "string" &&
        [m.key.remoteJid, m.key.remoteJidAlt].some((j) => allowed.has(j)),
    )
    .map((m) => ({
      key: m.key,
      pushName: m.pushName ?? null,
      messageType: m.messageType,
      message: m.message,
      messageTimestamp: m.messageTimestamp,
    }));
}
export function recoveryCandidates(messages, since, now = Date.now()) {
  const start = Date.parse(since);
  if (!Number.isFinite(start) || start > now || now - start > 48 * 3600000)
    throw new Error("INVALID_RECOVERY_WINDOW");
  const bySender = new Map();
  for (const message of [...messages].sort(
    (a, b) => Number(a.messageTimestamp) - Number(b.messageTimestamp),
  )) {
    const at = Number(message.messageTimestamp) * 1000;
    const jid = [message.key?.remoteJid, message.key?.remoteJidAlt].find((j) =>
      /^55\d{10,11}@s\.whatsapp\.net$/.test(j ?? ""),
    );
    if (
      message.key?.fromMe !== false ||
      !jid ||
      !Number.isFinite(at) ||
      at < start ||
      at > now ||
      bySender.has(jid)
    )
      continue;
    bySender.set(jid, { message, phone: jid.split("@")[0] });
  }
  return [...bySender.values()];
}
export function trustedLidForPhone(value, phone, allowedPhones) {
  if (!Array.isArray(value)) return null;
  const rows = value.filter((row) => row?.exists === true && row.number === phone);
  if (rows.length !== 1) return null;
  const row = rows[0],
    lid = [row.jid, row.lid].find((j) => /^\d{8,20}@lid$/.test(j ?? ""));
  if (!lid) return null;
  const canonical =
    typeof row.jid === "string" && row.jid.endsWith("@s.whatsapp.net")
      ? row.jid.split("@")[0]
      : phone;
  return { lid, phone: allowedPhones.includes(canonical) ? canonical : phone };
}
export async function inspect(env, fetcher = fetch, log = console.log) {
  if (env.SLIM_INBOUND_RECOVERY !== "inspect") return;
  const phones = JSON.parse(env.SLIM_INBOUND_RECOVERY_TARGETS ?? "[]");
  if (
    !Array.isArray(phones) ||
    phones.length < 1 ||
    phones.length > 4 ||
    phones.some((p) => typeof p !== "string" || !/^55\d{10,11}$/.test(p))
  )
    throw new Error("INVALID_TARGETS");
  if (env.SUPABASE_URL?.replace(/\/$/, "") !== `https://${PROJECT}.supabase.co`)
    throw new Error("WRONG_PROJECT");
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.INTEGRATION_ENCRYPTION_KEY || !env.EVOLUTION_BASE_URL)
    throw new Error("ENVIRONMENT_INCOMPLETE");
  const base = new URL(env.EVOLUTION_BASE_URL);
  if (!["https:", "http:"].includes(base.protocol) || base.username || base.password)
    throw new Error("INVALID_BASE");
  if (base.protocol === "http:" && !base.hostname.endsWith(".railway.internal"))
    throw new Error("INSECURE_BASE");
  let requests = 0;
  const deadline = Date.now() + 110000;
  async function json(url, headers, body) {
    if (++requests > 32 || Date.now() > deadline) throw new Error("REQUEST_BUDGET");
    const r = await fetcher(url, {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error("HTTP_" + r.status);
    const reader = r.body.getReader(),
      decoder = new TextDecoder();
    let text = "",
      bytes = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 8 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("RESPONSE_TOO_LARGE");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  }
  const key = env.SUPABASE_SERVICE_ROLE_KEY,
    headers = {
      apikey: key,
      "Content-Type": "application/json",
      ...(!key.startsWith("sb_secret_") ? { Authorization: "Bearer " + key } : {}),
    };
  const session = await json(
    `${env.SUPABASE_URL}/rest/v1/whatsapp_web_sessions?id=eq.${SESSION}&workspace_id=eq.${WORKSPACE}&select=id,workspace_id,provider,instance_id,status${env.SLIM_INBOUND_RECOVERY_EXECUTE === "1" ? ",webhook_secret,metadata" : ""}`,
    headers,
  );
  if (
    session.length !== 1 ||
    session[0].provider !== "evolution" ||
    session[0].status !== "conectado"
  )
    throw new Error("SESSION_UNAVAILABLE");
  const credentials = await json(
    `${env.SUPABASE_URL}/rest/v1/rpc/get_evolution_credentials_service`,
    headers,
    { _session_id: SESSION, _key: env.INTEGRATION_ENCRYPTION_KEY },
  );
  if (
    credentials?.workspace_id !== WORKSPACE ||
    credentials?.instance_name !== session[0].instance_id ||
    typeof credentials?.api_key !== "string" ||
    !credentials.api_key
  )
    throw new Error("SESSION_CREDENTIALS_UNAVAILABLE");
  const matches = new Map();
  const summaries = [];
  for (const phone of phones) {
    let reported = 0;
    let directFound = false,
      lidResolved = false;
    for (let page = 1; page <= 2; page++) {
      const jid = phone + "@s.whatsapp.net";
      const response = await json(
        `${base.toString().replace(/\/$/, "")}/chat/findMessages/${encodeURIComponent(session[0].instance_id)}`,
        { apikey: credentials.api_key, "Content-Type": "application/json" },
        { where: { key: { remoteJid: jid, remoteJidAlt: jid } }, offset: 100, page },
      );
      const found = matchingMessages(response, phones);
      if (matchingMessages(response, [phone]).length) directFound = true;
      for (const m of found) matches.set(m.key.id, m);
      reported = Number(response?.messages?.total ?? records(response).length);
      if (records(response).length < 100 || reported <= page * 100) break;
    }
    if (!directFound) {
      const providerHeaders = { apikey: credentials.api_key, "Content-Type": "application/json" };
      const lookup = await json(
        `${base.toString().replace(/\/$/, "")}/chat/whatsappNumbers/${encodeURIComponent(session[0].instance_id)}`,
        providerHeaders,
        { numbers: [phone] },
      );
      const mapping = trustedLidForPhone(lookup, phone, phones);
      if (mapping) {
        const response = await json(
          `${base.toString().replace(/\/$/, "")}/chat/findMessages/${encodeURIComponent(session[0].instance_id)}`,
          providerHeaders,
          {
            where: { key: { remoteJid: mapping.lid, remoteJidAlt: mapping.lid } },
            offset: 100,
            page: 1,
          },
        );
        for (const m of records(response)) {
          if (m?.key?.fromMe !== false || m.key.remoteJid !== mapping.lid) continue;
          if (
            m.key.remoteJidAlt &&
            !phones.some((p) => m.key.remoteJidAlt === p + "@s.whatsapp.net")
          )
            continue;
          const enriched = {
            ...m,
            key: {
              ...m.key,
              remoteJidAlt: m.key.remoteJidAlt ?? mapping.phone + "@s.whatsapp.net",
            },
          };
          for (const matched of matchingMessages([enriched], phones))
            matches.set(matched.key.id, matched);
        }
        lidResolved = true;
      }
    }
    summaries.push({ last4: phone.slice(-4), providerTotal: reported, lidResolved });
  }
  const result = [...matches.values()].sort(
    (a, b) => Number(a.messageTimestamp) - Number(b.messageTimestamp),
  );
  const summary = {
    operation: "SLIM_INBOUND_INSPECT",
    session: SESSION,
    queries: summaries,
    matched: result.length,
    messages: result.map((m) => ({
      id: m.key.id,
      at: m.messageTimestamp,
      greeting: /^\s*(oi+|ol[aá])\s*[!.?]*\s*$/i.test(
        String(m.message?.conversation ?? m.message?.extendedTextMessage?.text ?? ""),
      ),
      jidLast4: String(
        [m.key.remoteJid, m.key.remoteJidAlt].find((j) =>
          phones.some((p) => j === p + "@s.whatsapp.net"),
        ) ?? "",
      )
        .split("@")[0]
        .slice(-4),
    })),
  };
  if (env.SLIM_INBOUND_RECOVERY_EXECUTE === "1") {
    if (!/^[0-9a-f-]{36}$/i.test(env.SLIM_INBOUND_RECOVERY_REQUEST_ID ?? ""))
      throw new Error("INVALID_RECOVERY_REQUEST");
    summary.requestId = env.SLIM_INBOUND_RECOVERY_REQUEST_ID;
    if (typeof session[0].webhook_secret !== "string" || session[0].webhook_secret.length < 20)
      throw new Error("WEBHOOK_UNAVAILABLE");
    summary.recovery = [];
    const prior = session[0].metadata?.slim_inbound_inspection;
    const alreadyRecovered =
      prior?.requestId === summary.requestId && prior?.recoveryAttempted === true;
    if (alreadyRecovered) summary.recovery = prior.recovery ?? [];
    for (const { message, phone } of alreadyRecovered
      ? []
      : recoveryCandidates(result, env.SLIM_INBOUND_RECOVERY_SINCE)) {
      const url = `${env.SUPABASE_URL}/rest/v1/leads?workspace_id=eq.${WORKSPACE}&phone_normalized=eq.${phone}&merged_into_id=is.null&custom_data=cs.${encodeURIComponent(JSON.stringify({ whatsapp_session_id: SESSION }))}&select=id,pipeline_id,stage_id`;
      const existing = await json(url, headers);
      if (existing.length) {
        summary.recovery.push({
          messageId: message.key.id,
          leadId: existing[0].id,
          result: "existing-card-preserved",
        });
        continue;
      }
      const response = await json(
        `https://slimesaude.com/api/public/evolution/webhook/${encodeURIComponent(session[0].webhook_secret)}`,
        { apikey: credentials.api_key, "Content-Type": "application/json" },
        { event: "messages.upsert", instance: session[0].instance_id, data: message },
      );
      if (response?.ok !== true) throw new Error("RECOVERY_NOT_CONFIRMED");
      const confirmed = await json(url, headers);
      if (confirmed.length !== 1 || !confirmed[0].pipeline_id || !confirmed[0].stage_id)
        throw new Error("RECOVERY_CARD_NOT_CONFIRMED");
      summary.recovery.push({
        messageId: message.key.id,
        leadId: confirmed[0].id,
        pipelineId: confirmed[0].pipeline_id,
        stageId: confirmed[0].stage_id,
        result: "recovered-real-inbound",
      });
    }
  }
  if (env.SLIM_INBOUND_RECOVERY_EXECUTE === "1") summary.recoveryAttempted = true;
  log(JSON.stringify(summary));
  if (env.SLIM_INBOUND_INSPECTION_RECORD === "1") {
    const url = `${env.SUPABASE_URL}/rest/v1/whatsapp_web_sessions?id=eq.${SESSION}&workspace_id=eq.${WORKSPACE}`;
    const current = await json(url + "&select=metadata,updated_at", headers);
    if (current.length !== 1) throw new Error("SESSION_UNAVAILABLE");
    const saved = await fetcher(
      url + "&updated_at=eq." + encodeURIComponent(current[0].updated_at),
      {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=representation" },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          metadata: {
            ...(current[0].metadata ?? {}),
            slim_inbound_inspection: { ...summary, inspectedAt: new Date().toISOString() },
          },
        }),
      },
    );
    if (!saved.ok || (await saved.json()).length !== 1) throw new Error("INSPECTION_RECORD_FAILED");
  }
  return result;
}
if (
  process.env.SLIM_INBOUND_RECOVERY === "inspect" &&
  /[\\/]slim-inspect-inbound\.mjs$/.test(process.argv[1] ?? "")
)
  inspect(process.env).catch((error) =>
    console.log(
      JSON.stringify({
        operation: "SLIM_INBOUND_INSPECT",
        error: /^[A-Z_0-9]+$/.test(error.message) ? error.message : "INSPECTION_FAILED",
      }),
    ),
  );
