import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

type AnySb = { from: (t: string) => any };

const SettingsSchema = z.object({
  channels: z.record(z.string(), z.boolean()),
  matrix: z.record(z.string(), z.record(z.string(), z.boolean())),
  digest: z.record(z.string(), z.string()),
  quiet: z.object({
    enabled: z.boolean(),
    start: z.string().max(5),
    end: z.string().max(5),
    weekends: z.boolean(),
    urgent: z.boolean(),
  }),
  sound: z.boolean(),
});

export type NotificationSettingsPayload = z.infer<typeof SettingsSchema>;

/** Lê as preferências de notificação salvas no servidor para o usuário logado. */
export const getNotificationSettings = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { data, error } = await sb
      .from("user_notification_settings")
      .select("channels, matrix, digest, quiet, sound, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Motores de entrega realmente disponíveis hoje.
    let emailReady = false;
    try {
      const { data: prof } = await sb
        .from("profiles")
        .select("email, current_workspace_id")
        .eq("id", context.userId)
        .maybeSingle();
      emailReady = !!(prof as { email?: string } | null)?.email;
    } catch { /* ignora */ }

    return {
      settings: (data as any) ?? null,
      engines: {
        platform: true,
        push: true,
        email: emailReady,
        app: false,
        whatsapp: false,
      },
    };
  });

/** Grava (upsert) as preferências de notificação do usuário logado. */
export const saveNotificationSettings = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => SettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as AnySb;
    const { error } = await sb
      .from("user_notification_settings")
      .upsert(
        {
          user_id: context.userId,
          channels: data.channels,
          matrix: data.matrix,
          digest: data.digest,
          quiet: data.quiet,
          sound: data.sound,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, savedAt: new Date().toISOString() };
  });
