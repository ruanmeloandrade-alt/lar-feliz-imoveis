import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHost, getRequestUrl } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnySb = { from: (t: string) => any };

function rp() {
  const host = getRequestHost();
  const url = getRequestUrl();
  const id = String(host).split(":")[0]!;
  const origin = `${url.protocol}//${host}`;
  return { id, origin };
}

export type PasskeyRow = {
  id: string;
  nickname: string | null;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

/** Lista as chaves de segurança já cadastradas pelo usuário. */
export const listPasskeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PasskeyRow[]> => {
    const sb = context.supabase as unknown as AnySb;
    const { data } = await sb
      .from("user_passkeys")
      .select("id, nickname, device_type, backed_up, created_at, last_used_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      nickname: r.nickname,
      deviceType: r.device_type,
      backedUp: !!r.backed_up,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
    }));
  });

/** Gera o desafio para cadastrar uma nova chave (digital, Face ID, Windows Hello ou chave física). */
export const startPasskeyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { generateRegistrationOptions } = await import("@simplewebauthn/server");
    const claims = context.claims as { email?: string } | undefined;
    const { id: rpID } = rp();

    const { data: existing } = await sb
      .from("user_passkeys")
      .select("credential_id, transports")
      .eq("user_id", context.userId);

    const options = await generateRegistrationOptions({
      rpName: "MKTOn",
      rpID,
      userName: claims?.email ?? "usuario",
      userDisplayName: claims?.email ?? "MKTOn",
      attestationType: "none",
      excludeCredentials: ((existing ?? []) as any[]).map((c) => ({
        id: c.credential_id as string,
        transports: (c.transports ?? []) as any,
      })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
    });

    await sb.from("user_passkey_challenges").insert({
      user_id: context.userId,
      challenge: options.challenge,
      purpose: "register",
    });

    return { ok: true as const, options };
  });

/** Confere a resposta do aparelho e salva a chave de segurança. */
export const finishPasskeyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ response: z.any(), nickname: z.string().trim().max(60).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { verifyRegistrationResponse } = await import("@simplewebauthn/server");
    const { id: rpID, origin } = rp();

    const { data: rows } = await sb
      .from("user_passkey_challenges")
      .select("id, challenge, expires_at")
      .eq("user_id", context.userId)
      .eq("purpose", "register")
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const ch = (rows ?? [])[0] as { id: string; challenge: string; expires_at: string } | undefined;
    if (!ch) return { ok: false as const, error: "Desafio não encontrado. Tente cadastrar de novo." };
    if (new Date(ch.expires_at).getTime() < Date.now())
      return { ok: false as const, error: "O tempo para confirmar acabou. Tente de novo." };

    let v: any;
    try {
      v = await verifyRegistrationResponse({
        response: data.response,
        expectedChallenge: ch.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: false,
      });
    } catch (e) {
      return { ok: false as const, error: (e as Error).message || "Não consegui validar o aparelho." };
    }
    if (!v?.verified || !v.registrationInfo) return { ok: false as const, error: "Aparelho não validado." };

    const info = v.registrationInfo;
    const cred = info.credential;
    const publicKey = Buffer.from(cred.publicKey).toString("base64");

    const { error } = await sb.from("user_passkeys").insert({
      user_id: context.userId,
      credential_id: cred.id,
      public_key: publicKey,
      counter: cred.counter ?? 0,
      transports: cred.transports ?? [],
      device_type: info.credentialDeviceType ?? null,
      backed_up: !!info.credentialBackedUp,
      nickname: data.nickname || null,
    });
    if (error) return { ok: false as const, error: error.message };

    await sb.from("user_passkey_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", ch.id);
    await sb.from("user_mfa_settings").upsert(
      { user_id: context.userId, passkey_enabled: true, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    return { ok: true as const };
  });

/** Gera o desafio para testar/usar uma chave já cadastrada. */
export const startPasskeyAuthentication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { generateAuthenticationOptions } = await import("@simplewebauthn/server");
    const { id: rpID } = rp();

    const { data: creds } = await sb
      .from("user_passkeys")
      .select("credential_id, transports")
      .eq("user_id", context.userId);
    if (!creds || creds.length === 0) return { ok: false as const, error: "Nenhuma chave cadastrada." };

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      allowCredentials: (creds as any[]).map((c) => ({ id: c.credential_id, transports: (c.transports ?? []) as any })),
    });

    await sb.from("user_passkey_challenges").insert({
      user_id: context.userId,
      challenge: options.challenge,
      purpose: "auth",
    });

    return { ok: true as const, options };
  });

/** Confere a resposta da chave usada no teste de acesso. */
export const finishPasskeyAuthentication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ response: z.any() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");
    const { id: rpID, origin } = rp();

    const { data: rows } = await sb
      .from("user_passkey_challenges")
      .select("id, challenge, expires_at")
      .eq("user_id", context.userId)
      .eq("purpose", "auth")
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const ch = (rows ?? [])[0] as { id: string; challenge: string; expires_at: string } | undefined;
    if (!ch) return { ok: false as const, error: "Desafio não encontrado." };
    if (new Date(ch.expires_at).getTime() < Date.now())
      return { ok: false as const, error: "O tempo para confirmar acabou." };

    const credId = String((data.response as any)?.id ?? "");
    const { data: rowsCred } = await sb
      .from("user_passkeys")
      .select("id, credential_id, public_key, counter, transports")
      .eq("user_id", context.userId)
      .eq("credential_id", credId)
      .limit(1);
    const row = (rowsCred ?? [])[0] as any;
    if (!row) return { ok: false as const, error: "Esta chave não está cadastrada nesta conta." };

    let v: any;
    try {
      v = await verifyAuthenticationResponse({
        response: data.response,
        expectedChallenge: ch.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: false,
        credential: {
          id: row.credential_id,
          publicKey: new Uint8Array(Buffer.from(row.public_key, "base64")),
          counter: Number(row.counter ?? 0),
          transports: row.transports ?? [],
        },
      });
    } catch (e) {
      return { ok: false as const, error: (e as Error).message || "Não consegui validar a chave." };
    }
    if (!v?.verified) return { ok: false as const, error: "Chave não reconhecida." };

    await sb.from("user_passkey_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", ch.id);
    await sb
      .from("user_passkeys")
      .update({ counter: v.authenticationInfo?.newCounter ?? row.counter, last_used_at: new Date().toISOString() })
      .eq("id", row.id);
    return { ok: true as const };
  });

/** Apaga uma chave de segurança. */
export const deletePasskey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { error } = await sb.from("user_passkeys").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) return { ok: false as const, error: error.message };
    const { count } = await sb
      .from("user_passkeys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);
    if ((count ?? 0) === 0) {
      await sb.from("user_mfa_settings").upsert(
        { user_id: context.userId, passkey_enabled: false, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    }
    return { ok: true as const };
  });
