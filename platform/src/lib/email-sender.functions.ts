import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AnySb, EmailMode, EmailSecret } from "./email-sender.server";

const SaveGmailSchema = z.object({
  fromName: z.string().trim().max(80).optional(),
  replyTo: z.string().trim().email().optional().or(z.literal("")),
});

const SaveProviderSchema = z.object({
  mode: z.enum(["brevo", "resend", "sendgrid", "mailgun"]),
  apiKey: z.string().trim().min(8),
  fromEmail: z.string().trim().email(),
  fromName: z.string().trim().max(80).optional(),
  replyTo: z.string().trim().email().optional().or(z.literal("")),
  domain: z.string().trim().optional(),
  region: z.enum(["us", "eu"]).optional(),
});

const TestSchema = z.object({
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(150).optional(),
});

const SendSchema = z.object({
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(200),
  html: z.string().min(1).max(200_000),
});

export const getEmailSenderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await import("./email-sender.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const secret = await m.readEmailSecret(sb, workspaceId);

    let googleEmail: string | null = null;
    try {
      const g = await import("./google.server");
      const gs = await g.readGoogleSecretSafe(sb, workspaceId);
      googleEmail = (gs?.email as string | undefined) ?? null;
    } catch {
      // Google não conectado.
    }

    return {
      workspaceId,
      connected: !!secret,
      mode: (secret?.mode ?? null) as EmailMode | null,
      fromEmail: secret?.from_email ?? null,
      fromName: secret?.from_name ?? null,
      replyTo: secret?.reply_to ?? null,
      domain: secret?.domain ?? null,
      region: secret?.region ?? null,
      googleConnected: !!googleEmail,
      googleEmail,
      modes: m.EMAIL_MODE_INFO,
    };
  });

export const connectGmailSender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveGmailSchema.parse(d))
  .handler(async ({ data, context }) => {
    const m = await import("./email-sender.server");
    const g = await import("./google.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);

    const gs = await g.readGoogleSecretSafe(sb, workspaceId);
    if (!gs) throw new Error("Conecte a Conta Google primeiro, na integração Google (central).");
    const { token } = await g.getGoogleAccessToken(sb, workspaceId, gs);
    const info = await g.googleUserInfo(token);
    const email = info.email ?? (gs.email as string | undefined);
    if (!email) throw new Error("Não consegui identificar o endereço da sua conta Google.");

    const payload: EmailSecret = {
      mode: "gmail",
      from_email: email,
      from_name: data.fromName?.trim() || info.name || undefined,
      reply_to: data.replyTo?.trim() || undefined,
    };
    await m.writeEmailSecret(sb, {
      workspaceId,
      payload,
      metadata: { mode: "gmail", from_email: email, connected_at: new Date().toISOString() },
      status: "connected",
    });
    return { ok: true, fromEmail: email };
  });

export const connectEmailProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveProviderSchema.parse(d))
  .handler(async ({ data, context }) => {
    const m = await import("./email-sender.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);

    if (data.mode === "mailgun" && !data.domain?.trim()) {
      throw new Error("O Mailgun precisa do domínio de envio, por exemplo mg.suaempresa.com.");
    }

    const payload: EmailSecret = {
      mode: data.mode,
      api_key: data.apiKey.trim(),
      from_email: data.fromEmail.trim(),
      from_name: data.fromName?.trim() || undefined,
      reply_to: data.replyTo?.trim() || undefined,
      domain: data.domain?.trim() || undefined,
      region: data.region,
    };

    const problem = await m.verifyProviderKey(payload);
    if (problem) throw new Error(problem);

    await m.writeEmailSecret(sb, {
      workspaceId,
      payload,
      metadata: {
        mode: data.mode,
        from_email: payload.from_email,
        domain: payload.domain ?? null,
        connected_at: new Date().toISOString(),
      },
      status: "connected",
    });
    return { ok: true, fromEmail: payload.from_email };
  });

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TestSchema.parse(d))
  .handler(async ({ data, context }) => {
    const m = await import("./email-sender.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const r = await m.sendWorkspaceEmail(sb, workspaceId, {
      to: data.to,
      subject: data.subject?.trim() || "Teste de envio da MKTOn",
      html:
        '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">' +
        "<p>Deu certo. Este e-mail saiu direto da sua conta conectada na MKTOn.</p>" +
        "<p>A partir de agora as automações de e-mail e as campanhas usam este mesmo remetente.</p>" +
        "</div>",
    });
    return { ok: true, messageId: r.id, from: r.from, mode: r.mode };
  });

export const sendWorkspaceEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendSchema.parse(d))
  .handler(async ({ data, context }) => {
    const m = await import("./email-sender.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    const r = await m.sendWorkspaceEmail(sb, workspaceId, {
      to: data.to,
      subject: data.subject,
      html: data.html,
    });
    return { ok: true, messageId: r.id, from: r.from, mode: r.mode };
  });

export const disconnectEmailSender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await import("./email-sender.server");
    const sb = context.supabase as unknown as AnySb;
    const workspaceId = await m.activeWorkspace(sb, context.userId);
    await sb.from("integrations").delete()
      .eq("workspace_id", workspaceId)
      .eq("provider", m.EMAIL_PROVIDER);
    return { ok: true };
  });
