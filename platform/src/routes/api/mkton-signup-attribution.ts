import { createFileRoute } from "@tanstack/react-router";
import { verifyBearer } from "@/lib/ai-agent/auth-bearer.server";
import { MKTON_FUNNELS } from "@/config/marketon-operation";
import { resolveExistingMktonFunnel } from "@/lib/mkton-existing-funnel-resolver.server";

const MKTON_ADMIN_WORKSPACE_SLUG = "ruanandradenegocios.mkton";
const SIGNUP_SOURCE = "mkton_public_signup";
const SIGNUP_SYNC_WINDOW_MS = 72 * 60 * 60 * 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const asText = (value: unknown, max = 160) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const normalizePhone = (value: string) => {
  const raw = value.trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return "";
  if (raw.startsWith("+")) return digits.slice(0, 15);
  if (digits.startsWith("00") && digits.length >= 12) return digits.slice(2, 17);
  if (digits.startsWith("55") && digits.length >= 12) return digits.slice(0, 13);
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits.slice(0, 15);
};

const displayPhone = (normalized: string) => (normalized ? `+${normalized}` : "");

const normalizeInstagram = (value: string) => {
  const clean = value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/[/?#].*$/, "")
    .replace(/[^a-zA-Z0-9._]/g, "")
    .slice(0, 30);
  return clean ? `@${clean}` : "";
};

type AnySb = { from: (table: string) => any };
type SignupProfile = {
  responsibleName: string;
  whatsapp: string;
  instagram: string;
};

type LeadRow = {
  id: string;
  email: string | null;
  phone: string | null;
  phone_normalized: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  source: string | null;
  tags: unknown;
  custom_data: unknown;
  created_at: string;
};

function profileFrom(input: Record<string, unknown>, metadata: Record<string, unknown>): SignupProfile {
  const responsibleName = asText(input.responsibleName, 100) || asText(metadata.responsible_name, 100) || asText(metadata.full_name, 100);
  const whatsapp = normalizePhone(asText(input.whatsapp, 40) || asText(metadata.whatsapp, 40) || asText(metadata.phone, 40));
  const instagram = normalizeInstagram(asText(input.instagram, 80) || asText(metadata.instagram, 80));
  return { responsibleName, whatsapp, instagram };
}

async function resolveOperationalFunnel(sb: AnySb, workspaceId: string, key: "lead_entry" | "registration") {
  const spec = MKTON_FUNNELS.find((item) => item.key === key);
  if (!spec) throw new Error(`Configuração do funil ${key} não encontrada.`);
  const pipeline = await resolveExistingMktonFunnel(sb as never, workspaceId, spec.name, spec.stages);
  const { data: stages, error } = await sb
    .from("pipeline_stages")
    .select("id,name,position")
    .eq("workspace_id", workspaceId)
    .eq("pipeline_id", pipeline.id)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return { spec, pipeline, stages: (stages ?? []) as Array<{ id: string; name: string; position: number }> };
}

function stageByName(stages: Array<{ id: string; name: string }>, name: string) {
  const hit = stages.find((stage) => normalize(stage.name) === normalize(name));
  if (!hit) throw new Error(`Etapa ${name} não encontrada no CRM Vanessa Simoni.`);
  return hit;
}

async function ensureInstagramField(sb: AnySb, workspaceId: string) {
  const findExisting = () => sb
    .from("lead_custom_fields")
    .select("id,name")
    .eq("workspace_id", workspaceId)
    .ilike("name", "Instagram")
    .limit(1)
    .maybeSingle();

  const { data: existing, error } = await findExisting();
  if (error) throw new Error(error.message);
  if (existing?.id) return String(existing.id);

  const { data, error: insertError } = await sb
    .from("lead_custom_fields")
    .insert({ workspace_id: workspaceId, name: "Instagram", field_type: "text", options: [] })
    .select("id")
    .single();
  if (!insertError && data?.id) return String(data.id);

  const { data: recovered, error: recoveryError } = await findExisting();
  if (recoveryError || !recovered?.id) throw new Error(insertError?.message ?? "Não foi possível criar o campo Instagram.");
  return String(recovered.id);
}

async function setCustomField(sb: AnySb, input: { workspaceId: string; leadId: string; fieldId: string; value: string }) {
  const findCurrent = () => sb
    .from("lead_custom_field_values")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("lead_id", input.leadId)
    .eq("field_id", input.fieldId)
    .maybeSingle();

  const updateValue = async (id: string) => {
    const { error } = await sb
      .from("lead_custom_field_values")
      .update({ value: input.value, updated_at: new Date().toISOString() })
      .eq("workspace_id", input.workspaceId)
      .eq("id", id);
    if (error) throw new Error(error.message);
  };

  const { data: current, error } = await findCurrent();
  if (error) throw new Error(error.message);
  if (current?.id) {
    await updateValue(String(current.id));
    return;
  }

  const { error: insertError } = await sb.from("lead_custom_field_values").insert({
    workspace_id: input.workspaceId,
    lead_id: input.leadId,
    field_id: input.fieldId,
    value: input.value,
  });
  if (!insertError) return;

  const { data: recovered, error: recoveryError } = await findCurrent();
  if (recoveryError || !recovered?.id) throw new Error(insertError.message);
  await updateValue(String(recovered.id));
}

function tagsWithSignup(existing: unknown) {
  const tags = Array.isArray(existing) ? existing.filter((value): value is string => typeof value === "string") : [];
  return Array.from(new Set([...tags, "jornada:new-cad", "canal:cadastro-site", "origem:site"]));
}

function signupAuthUserId(customData: unknown) {
  if (!customData || typeof customData !== "object" || Array.isArray(customData)) return "";
  const signup = (customData as Record<string, unknown>).signup;
  if (!signup || typeof signup !== "object" || Array.isArray(signup)) return "";
  const value = (signup as Record<string, unknown>).auth_user_id;
  return typeof value === "string" ? value : "";
}

function mergedCustomData(existing: unknown, profile: SignupProfile, authUserId: string) {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
  return {
    ...base,
    signup: {
      responsible_name: profile.responsibleName,
      whatsapp: displayPhone(profile.whatsapp),
      instagram: profile.instagram,
      auth_user_id: authUserId,
      source: "site",
      synced_at: new Date().toISOString(),
    },
  };
}

function leadBelongsToSignup(row: LeadRow, authUserId: string) {
  const claimedBy = signupAuthUserId(row.custom_data);
  return !claimedBy || claimedBy === authUserId;
}

async function findLeadBySignupIdentity(sb: AnySb, workspaceId: string, authUserId: string): Promise<LeadRow | null> {
  const { data, error } = await sb
    .from("leads")
    .select("id,email,phone,phone_normalized,pipeline_id,stage_id,source,tags,custom_data,created_at")
    .eq("workspace_id", workspaceId)
    .contains("custom_data", { signup: { auth_user_id: authUserId } })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? data as LeadRow : null;
}

async function ensureSignupActivity(sb: AnySb, input: {
  workspaceId: string;
  leadId: string;
  authUserId: string;
  payload: Record<string, unknown>;
}) {
  const { error } = await sb.from("lead_activities").insert({
    workspace_id: input.workspaceId,
    lead_id: input.leadId,
    type: "signup_completed",
    payload: { ...input.payload, auth_user_id: input.authUserId },
  });
  if (!error) return;

  const { data: existing, error: recoveryError } = await sb
    .from("lead_activities")
    .select("lead_id")
    .eq("workspace_id", input.workspaceId)
    .eq("type", "signup_completed")
    .contains("payload", { auth_user_id: input.authUserId })
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recoveryError) throw new Error(recoveryError.message);
  if (existing?.lead_id && String(existing.lead_id) === input.leadId) return;
  throw new Error(error.message);
}

async function chooseExistingLead(sb: AnySb, input: { workspaceId: string; email: string; phone: string; authUserId: string; trustedLeadId?: string | null; registrationPipelineId: string; leadEntryPipelineId: string }) {
  if (input.trustedLeadId) {
    const { data, error } = await sb
      .from("leads")
      .select("id,email,phone,phone_normalized,pipeline_id,stage_id,source,tags,custom_data,created_at")
      .eq("workspace_id", input.workspaceId)
      .eq("id", input.trustedLeadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data && leadBelongsToSignup(data as LeadRow, input.authUserId)) return data as LeadRow;
  }

  const candidates = new Map<string, LeadRow>();
  const { data: byEmail, error: emailError } = await sb
    .from("leads")
    .select("id,email,phone,phone_normalized,pipeline_id,stage_id,source,tags,custom_data,created_at")
    .eq("workspace_id", input.workspaceId)
    .ilike("email", input.email)
    .order("created_at", { ascending: false })
    .limit(5);
  if (emailError) throw new Error(emailError.message);
  for (const row of byEmail ?? []) {
    const lead = row as LeadRow;
    if (leadBelongsToSignup(lead, input.authUserId)) candidates.set(String(row.id), lead);
  }

  if (input.phone) {
    const { data: byPhone, error: phoneError } = await sb
      .from("leads")
      .select("id,email,phone,phone_normalized,pipeline_id,stage_id,source,tags,custom_data,created_at")
      .eq("workspace_id", input.workspaceId)
      .eq("phone_normalized", input.phone)
      .order("created_at", { ascending: false })
      .limit(5);
    if (phoneError) throw new Error(phoneError.message);
    for (const row of byPhone ?? []) {
      const lead = row as LeadRow;
      if (leadBelongsToSignup(lead, input.authUserId)) candidates.set(String(row.id), lead);
    }
  }

  const rows = [...candidates.values()];
  return (
    rows.find((row) => row.pipeline_id === input.registrationPipelineId) ??
    rows.find((row) => row.pipeline_id === input.leadEntryPipelineId) ??
    rows[0] ??
    null
  );
}

export const Route = createFileRoute("/api/mkton-signup-attribution")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let auth;
        try {
          auth = await verifyBearer(request);
        } catch (error) {
          return json({ ok: false, error: (error as Error).message }, 401);
        }

        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const linkSlug = asText(body.linkSlug, 80);
        const attributionToken = asText(body.attributionToken, 50);
        const requestedLeadId = asText(body.leadId, 50);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sb = supabaseAdmin as unknown as AnySb;
        const { data: authUser, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(auth.userId);
        const user = authUser?.user;
        if (authUserError || !user?.email || !user.created_at) {
          return json({ ok: false, error: "Usuário autenticado sem identidade verificável." }, 401);
        }

        const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
        const profile = profileFrom(body, metadata);
        const email = user.email.trim().toLowerCase();
        const createdAt = new Date(user.created_at);
        const ageMs = Date.now() - createdAt.getTime();
        const isPublicSignup = metadata.signup_source === SIGNUP_SOURCE;
        const hasAttribution = Boolean(linkSlug && /^[0-9a-f-]{36}$/i.test(attributionToken));

        if (!Number.isFinite(createdAt.getTime())) return json({ ok: false, error: "Data de criação da conta inválida." }, 401);
        if (!isPublicSignup && !hasAttribution) return json({ ok: true, synced: false, reason: "not_public_signup" });
        if (!hasAttribution && ageMs > SIGNUP_SYNC_WINDOW_MS) return json({ ok: true, synced: false, reason: "signup_window_expired" });
        if (!profile.responsibleName || !profile.whatsapp || !profile.instagram) {
          return json({ ok: false, error: "Cadastro sem nome, WhatsApp ou Instagram válidos." }, 422);
        }

        const { data: workspace, error: workspaceError } = await sb
          .from("workspaces")
          .select("id,name,slug")
          .eq("slug", MKTON_ADMIN_WORKSPACE_SLUG)
          .maybeSingle();
        if (workspaceError) return json({ ok: false, error: workspaceError.message }, 500);
        if (!workspace?.id) return json({ ok: false, error: "Workspace administrativo Mkton não encontrado." }, 409);
        const workspaceId = String(workspace.id);

        const leadEntry = await resolveOperationalFunnel(sb, workspaceId, "lead_entry");
        const registration = await resolveOperationalFunnel(sb, workspaceId, "registration");
        const newCad = stageByName(registration.stages, "New Cad");

        let trustedLeadId: string | null = null;
        let attribution: { id: string; site_id: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; clickId: string } | null = null;

        if (hasAttribution) {
          const { data: link, error: linkError } = await sb
            .from("tracked_links")
            .select("id,workspace_id,site_id,slug,utm_source,utm_medium,utm_campaign,utm_content")
            .eq("slug", linkSlug)
            .maybeSingle();
          if (linkError) return json({ ok: false, error: linkError.message }, 500);
          if (link?.workspace_id && String(link.workspace_id) === workspaceId) {
            const clickWindowStart = new Date(createdAt.getTime() - 24 * 60 * 60 * 1000).toISOString();
            const { data: clicks, error: clickError } = await sb
              .from("tracking_events")
              .select("id,lead_id,created_at")
              .eq("workspace_id", workspaceId)
              .eq("event_name", "link_click")
              .contains("props", { tracked_link_slug: linkSlug, attribution_token: attributionToken })
              .gte("created_at", clickWindowStart)
              .lte("created_at", createdAt.toISOString())
              .order("created_at", { ascending: false })
              .limit(1);
            if (clickError) return json({ ok: false, error: clickError.message }, 500);
            const click = clicks?.[0];
            if (click) {
              trustedLeadId = click.lead_id ? String(click.lead_id) : null;
              if (requestedLeadId && trustedLeadId && requestedLeadId !== trustedLeadId) trustedLeadId = null;
              attribution = {
                id: String(link.id),
                site_id: link.site_id ? String(link.site_id) : null,
                utm_source: link.utm_source ?? null,
                utm_medium: link.utm_medium ?? null,
                utm_campaign: link.utm_campaign ?? null,
                utm_content: link.utm_content ?? null,
                clickId: String(click.id),
              };
            }
          }
        }

        const { data: sources, error: sourceError } = await sb
          .from("crm_sources")
          .select("id,is_default")
          .eq("workspace_id", workspaceId)
          .order("is_default", { ascending: false })
          .limit(1);
        if (sourceError) return json({ ok: false, error: sourceError.message }, 500);
        const crmSourceId = sources?.[0]?.id ? String(sources[0].id) : "";
        if (!crmSourceId) return json({ ok: false, error: "Fonte CRM Mkton não encontrada." }, 409);

        let existing = await chooseExistingLead(sb, {
          workspaceId,
          email,
          phone: profile.whatsapp,
          authUserId: auth.userId,
          trustedLeadId,
          registrationPipelineId: String(registration.pipeline.id),
          leadEntryPipelineId: String(leadEntry.pipeline.id),
        });

        const now = new Date().toISOString();
        const basePayload = {
          name: profile.responsibleName,
          email,
          phone: displayPhone(profile.whatsapp),
          phone_normalized: profile.whatsapp,
          source: "site_signup",
          updated_at: now,
        };

        let leadId: string;
        let moved = false;
        let created = false;
        let fromStageId: string | null = null;

        if (!existing) {
          const { data: inserted, error: insertError } = await sb
            .from("leads")
            .insert({
              workspace_id: workspaceId,
              crm_source_id: crmSourceId,
              pipeline_id: registration.pipeline.id,
              stage_id: newCad.id,
              ...basePayload,
              tags: tagsWithSignup([]),
              custom_data: mergedCustomData({}, profile, auth.userId),
            })
            .select("id")
            .single();

          if (!insertError && inserted?.id) {
            leadId = String(inserted.id);
            created = true;
          } else {
            existing = await findLeadBySignupIdentity(sb, workspaceId, auth.userId);
            if (!existing) return json({ ok: false, error: insertError?.message ?? "Não foi possível criar o lead do cadastro." }, 500);
            leadId = existing.id;
          }
        } else {
          leadId = existing.id;
        }

        if (!created && existing) {
          const alreadyInRegistration = existing.pipeline_id === String(registration.pipeline.id);
          const updatePayload = {
            ...basePayload,
            tags: tagsWithSignup(existing.tags),
            custom_data: mergedCustomData(existing.custom_data, profile, auth.userId),
            ...(alreadyInRegistration ? {} : { pipeline_id: registration.pipeline.id, stage_id: newCad.id }),
          };
          const { error: updateError } = await sb
            .from("leads")
            .update(updatePayload)
            .eq("workspace_id", workspaceId)
            .eq("id", leadId);
          if (updateError) return json({ ok: false, error: updateError.message }, 500);
          if (!alreadyInRegistration) {
            moved = true;
            fromStageId = existing.stage_id ?? null;
          }
        }

        const instagramFieldId = await ensureInstagramField(sb, workspaceId);
        await setCustomField(sb, { workspaceId, leadId, fieldId: instagramFieldId, value: profile.instagram });

        await ensureSignupActivity(sb, {
          workspaceId,
          leadId,
          authUserId: auth.userId,
          payload: {
            responsible_name: profile.responsibleName,
            whatsapp: displayPhone(profile.whatsapp),
            instagram: profile.instagram,
            source: attribution ? "tracked_signup" : "site_signup",
          },
        });

        const { dispatchCrmLeadCreated, dispatchCrmStageMoved, dispatchCrmFieldUpdated } = await import("@/lib/crm-event-dispatch.server");
        if (created) {
          await dispatchCrmLeadCreated(supabaseAdmin as never, {
            workspaceId,
            leadId,
            pipelineId: String(registration.pipeline.id),
            stageId: String(newCad.id),
          });
          await dispatchCrmStageMoved(supabaseAdmin as never, {
            workspaceId,
            leadId,
            newStageId: String(newCad.id),
            newPipelineId: String(registration.pipeline.id),
            fromStageId: null,
          });
        } else if (moved) {
          await dispatchCrmStageMoved(supabaseAdmin as never, {
            workspaceId,
            leadId,
            newStageId: String(newCad.id),
            newPipelineId: String(registration.pipeline.id),
            fromStageId,
          });
        }
        await dispatchCrmFieldUpdated(supabaseAdmin as never, {
          workspaceId,
          leadId,
          fieldId: instagramFieldId,
          fieldName: "Instagram",
        });

        if (attribution) {
          const { error: attributionError } = await sb.from("tracking_events").insert({
            workspace_id: workspaceId,
            site_id: attribution.site_id,
            event_name: "signup_completed",
            lead_id: leadId,
            source_class: "cliente",
            utm_source: attribution.utm_source,
            utm_medium: attribution.utm_medium,
            utm_campaign: attribution.utm_campaign,
            utm_content: attribution.utm_content,
            props: {
              tracked_link_slug: linkSlug,
              attribution_token: attributionToken,
              auth_user_id: auth.userId,
              click_event_id: attribution.clickId,
              signup_profile_synced: true,
            },
          } as never);
          if (attributionError) {
            return json({ ok: false, error: "O cadastro foi reconciliado no CRM, mas a atribuição de Tracking não foi persistida." }, 500);
          }
        }

        return json({
          ok: true,
          synced: true,
          created,
          moved,
          leadId,
          pipelineId: registration.pipeline.id,
          stageId: newCad.id,
          stageName: newCad.name,
        });
      },
    },
  },
});