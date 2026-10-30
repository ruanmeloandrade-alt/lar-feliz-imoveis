// Central de E-mail: envio real por Gmail ou por provedor de API.
// Tudo por HTTP, sem SMTP.

export const EMAIL_PROVIDER = "email_sender";

export type SbRpc = {
  rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};
export type AnySb = SbRpc & { from: (t: string) => any };

export function encKey() {
  const k = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!k) throw new Error("INTEGRATION_ENCRYPTION_KEY missing");
  return k;
}

export async function activeWorkspace(sb: AnySb, userId: string): Promise<string> {
  const { data } = await sb.from("profiles").select("current_workspace_id").eq("id", userId).maybeSingle();
  const id = (data as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (!id) throw new Error("Workspace ativo não encontrado.");
  return id;
}

export type EmailMode = "gmail" | "brevo" | "resend" | "sendgrid" | "mailgun";

export interface EmailSecret {
  mode: EmailMode;
  from_email?: string;
  from_name?: string;
  reply_to?: string;
  api_key?: string;
  domain?: string;
  region?: "us" | "eu";
}

export const EMAIL_MODE_INFO: Record<EmailMode, { label: string; dailyLimit: string; needsDomain: boolean }> = {
  gmail: { label: "Gmail / Google Workspace", dailyLimit: "conforme os limites da conta Google", needsDomain: false },
  brevo: { label: "Brevo", dailyLimit: "300 por dia no plano gratuito", needsDomain: false },
  resend: { label: "Resend", dailyLimit: "3.000 por mês no plano gratuito", needsDomain: true },
  sendgrid: { label: "SendGrid", dailyLimit: "100 por dia no plano gratuito", needsDomain: true },
  mailgun: { label: "Mailgun", dailyLimit: "conforme o plano contratado", needsDomain: true },
};

export async function readEmailSecret(sb: SbRpc, workspaceId: string): Promise<EmailSecret | null> {
  const { data, error } = await sb.rpc("get_integration_secret", {
    _workspace_id: workspaceId,
    _provider: EMAIL_PROVIDER,
    _key: encKey(),
  });
  if (error || !data) return null;
  const secret = data as Partial<EmailSecret>;
  if (!secret.mode || !Object.prototype.hasOwnProperty.call(EMAIL_MODE_INFO, secret.mode)) return null;
  return secret as EmailSecret;
}

export async function writeEmailSecret(
  sb: SbRpc,
  args: { workspaceId: string; payload: EmailSecret; metadata: Record<string, unknown>; status: string },
) {
  const { error } = await sb.rpc("set_integration_secret", {
    _workspace_id: args.workspaceId,
    _provider: EMAIL_PROVIDER,
    _plaintext: JSON.parse(JSON.stringify(args.payload)),
    _key: encKey(),
    _metadata: JSON.parse(JSON.stringify(args.metadata)),
    _status: args.status,
  });
  if (error) throw new Error(error.message ?? "Falha ao salvar a configuração de e-mail.");
}

function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(value)));
  return `=?UTF-8?B?${b64}?=`;
}

function base64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function textFromHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendViaGmail(token: string, from: string, fromName: string | undefined, mail: OutgoingEmail, replyTo?: string) {
  const boundary = `mkton_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${fromName ? `${encodeHeader(fromName)} <${from}>` : from}`,
    `To: ${mail.to}`,
    replyTo ? `Reply-To: ${replyTo}` : null,
    `Subject: ${encodeHeader(mail.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean) as string[];
  const body = [
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    mail.text ?? textFromHtml(mail.html),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    mail.html,
    `--${boundary}--`,
    "",
  ];
  const raw = base64Url([...headers, ...body].join("\r\n"));
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  const j = (await r.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!r.ok) throw new Error(j.error?.message ?? `Gmail recusou o envio (${r.status}).`);
  return { id: j.id ?? null };
}

export async function sendViaBrevo(apiKey: string, from: string, fromName: string | undefined, mail: OutgoingEmail, replyTo?: string) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: from, name: fromName || undefined },
      to: [{ email: mail.to }],
      replyTo: replyTo ? { email: replyTo } : undefined,
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text ?? textFromHtml(mail.html),
    }),
  });
  const j = (await r.json().catch(() => ({}))) as { messageId?: string; message?: string };
  if (!r.ok) throw new Error(j.message ?? `Brevo recusou o envio (${r.status}).`);
  return { id: j.messageId ?? null };
}

export async function sendViaResend(apiKey: string, from: string, fromName: string | undefined, mail: OutgoingEmail, replyTo?: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromName ? `${fromName} <${from}>` : from,
      to: [mail.to],
      reply_to: replyTo || undefined,
      subject: mail.subject,
      html: mail.html,
      text: mail.text ?? textFromHtml(mail.html),
    }),
  });
  const j = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!r.ok) throw new Error(j.message ?? `Resend recusou o envio (${r.status}).`);
  return { id: j.id ?? null };
}

export async function sendViaSendgrid(apiKey: string, from: string, fromName: string | undefined, mail: OutgoingEmail, replyTo?: string) {
  const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: mail.to }] }],
      from: { email: from, name: fromName || undefined },
      reply_to: replyTo ? { email: replyTo } : undefined,
      subject: mail.subject,
      content: [
        { type: "text/plain", value: mail.text ?? textFromHtml(mail.html) },
        { type: "text/html", value: mail.html },
      ],
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `SendGrid recusou o envio (${r.status}).`);
  }
  return { id: r.headers.get("x-message-id") };
}

export async function sendViaMailgun(
  apiKey: string,
  domain: string,
  region: "us" | "eu" | undefined,
  from: string,
  fromName: string | undefined,
  mail: OutgoingEmail,
  replyTo?: string,
) {
  const host = region === "eu" ? "api.eu.mailgun.net" : "api.mailgun.net";
  const form = new URLSearchParams({
    from: fromName ? `${fromName} <${from}>` : from,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text ?? textFromHtml(mail.html),
  });
  if (replyTo) form.set("h:Reply-To", replyTo);
  const r = await fetch(`https://${host}/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const j = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!r.ok) throw new Error(j.message ?? `Mailgun recusou o envio (${r.status}).`);
  return { id: j.id ?? null };
}

export async function verifyProviderKey(secret: EmailSecret): Promise<string | null> {
  try {
    if (secret.mode === "brevo") {
      const r = await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": secret.api_key ?? "" } });
      if (!r.ok) return "A chave da Brevo não foi aceita. Gere outra em Brevo, SMTP & API.";
      return null;
    }
    if (secret.mode === "resend") {
      const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${secret.api_key}` } });
      if (!r.ok) return "A chave do Resend não foi aceita. Gere outra em Resend, API Keys.";
      return null;
    }
    if (secret.mode === "sendgrid") {
      const r = await fetch("https://api.sendgrid.com/v3/scopes", { headers: { Authorization: `Bearer ${secret.api_key}` } });
      if (!r.ok) return "A chave do SendGrid não foi aceita. Gere outra com permissão Mail Send.";
      return null;
    }
    if (secret.mode === "mailgun") {
      const host = secret.region === "eu" ? "api.eu.mailgun.net" : "api.mailgun.net";
      const r = await fetch(`https://${host}/v3/domains/${secret.domain}`, {
        headers: { Authorization: `Basic ${btoa(`api:${secret.api_key}`)}` },
      });
      if (!r.ok) return "A chave ou o domínio do Mailgun não foram aceitos. Confira também se a região está certa.";
      return null;
    }
  } catch {
    return "Não consegui falar com o provedor agora. Tente de novo em instantes.";
  }
  return null;
}

export async function sendWorkspaceEmail(
  sb: AnySb,
  workspaceId: string,
  mail: OutgoingEmail,
): Promise<{ id: string | null; mode: EmailMode; from: string }> {
  const secret = await readEmailSecret(sb, workspaceId);
  if (!secret) throw new Error("Nenhum e-mail conectado neste workspace.");
  const from = secret.from_email;
  if (!from) throw new Error("Remetente não configurado na central de e-mail.");

  if (secret.mode === "gmail") {
    const g = await import("./google.server");
    const { token } = await g.getGoogleAccessToken(sb, workspaceId);
    const r = await sendViaGmail(token, from, secret.from_name, mail, secret.reply_to);
    return { ...r, mode: secret.mode, from };
  }
  if (secret.mode === "brevo") {
    const r = await sendViaBrevo(secret.api_key ?? "", from, secret.from_name, mail, secret.reply_to);
    return { ...r, mode: secret.mode, from };
  }
  if (secret.mode === "resend") {
    const r = await sendViaResend(secret.api_key ?? "", from, secret.from_name, mail, secret.reply_to);
    return { ...r, mode: secret.mode, from };
  }
  if (secret.mode === "sendgrid") {
    const r = await sendViaSendgrid(secret.api_key ?? "", from, secret.from_name, mail, secret.reply_to);
    return { ...r, mode: secret.mode, from };
  }
  const r = await sendViaMailgun(
    secret.api_key ?? "",
    secret.domain ?? "",
    secret.region,
    from,
    secret.from_name,
    mail,
    secret.reply_to,
  );
  return { ...r, mode: secret.mode, from };
}
