/**
 * Identidade do tracking: liga o visitante anônimo (anon_id) a um lead real.
 * Roda 100% no servidor (chamado pelo endpoint público de coleta).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = any;

export type SourceClass = "cliente" | "interno" | "preview" | "localhost" | "desconhecido";

type LeadLookupRow = { id: string; custom_data?: Record<string, unknown> | null };
type IdentityRow = { id: string; lead_id: string | null; first_utm: unknown };

const INTERNAL_HOSTS = [/(^|\.)mkton\.io$/i, /(^|\.)code-to-lovely-ui\.lovable\.app$/i];
const PREVIEW_HOSTS = [/id-preview/i, /-preview--/i, /lovableproject\.com$/i, /lovable\.dev$/i];
const LOCAL_HOSTS = [/^localhost$/i, /^127\.0\.0\.1$/, /^0\.0\.0\.0$/, /\.local$/i];

export function hostFromUrl(raw: string | null | undefined): string | null {
  try {
    return new URL(String(raw ?? "")).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Classifica a origem do evento para não poluir os KPIs do cliente. */
export function classifySource(url: string | null | undefined): SourceClass {
  const host = hostFromUrl(url);
  if (!host) return "desconhecido";
  if (LOCAL_HOSTS.some((r) => r.test(host))) return "localhost";
  if (PREVIEW_HOSTS.some((r) => r.test(host))) return "preview";
  if (INTERNAL_HOSTS.some((r) => r.test(host))) return "interno";
  return "cliente";
}

export function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}

export function normalizePhone(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.replace(/\D/g, "");
  return d.length >= 8 ? d : null;
}

export interface ResolveIdentityInput {
  workspaceId: string;
  anonId: string | null;
  email: string | null;
  phone: string | null;
  explicitLeadId: string | null;
  utm: Record<string, string | null>;
  createLeadIfMissing?: boolean;
  leadName?: string | null;
  sourceLabel?: string | null;
}

export interface ResolvedIdentity {
  leadId: string | null;
  created: boolean;
  backfilled: number;
}

/**
 * Resolve (ou cria) o lead do visitante e persiste o vínculo anon_id -> lead_id,
 * fazendo backfill dos eventos anteriores do mesmo visitante.
 */
export async function resolveTrackingIdentity(
  admin: AnySb,
  input: ResolveIdentityInput,
): Promise<ResolvedIdentity> {
  const ws = input.workspaceId;
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  let leadId: string | null = null;
  let leadCustomData: Record<string, unknown> = {};
  let pendingCreatedDispatch = false;
  let created = false;

  const acceptLead = (row: LeadLookupRow | null | undefined) => {
    if (!row?.id) return;
    leadId = row.id;
    leadCustomData = row.custom_data ?? {};
    pendingCreatedDispatch = leadCustomData.tracking_crm_created_dispatched === false;
  };

  // lead_id vindo do navegador nunca é confiável: valida existência no mesmo workspace.
  const explicitLeadId = /^[0-9a-f-]{36}$/i.test(String(input.explicitLeadId ?? ""))
    ? String(input.explicitLeadId)
    : null;
  if (explicitLeadId) {
    const { data, error } = await admin
      .from("leads")
      .select("id, custom_data")
      .eq("workspace_id", ws)
      .eq("id", explicitLeadId)
      .maybeSingle();
    if (error) throw new Error(`Tracking explicit lead lookup failed: ${error.message}`);
    acceptLead(data as LeadLookupRow | null);
  }

  // 1) vínculo do visitante. A linha é criada antes de qualquer criação de lead para que
  // concorrências usem a mesma identidade; a migration garante UNIQUE(workspace_id, anon_id).
  let identity: IdentityRow | null = null;
  if (input.anonId) {
    const { data, error } = await admin
      .from("tracking_identities")
      .select("id, lead_id, first_utm")
      .eq("workspace_id", ws)
      .eq("anon_id", input.anonId)
      .maybeSingle();
    if (error) throw new Error(`Tracking identity lookup failed: ${error.message}`);
    identity = (data as IdentityRow | null) ?? null;

    if (!identity) {
      const nowIso = new Date().toISOString();
      const { data: insertedIdentity, error: identityInsertError } = await admin
        .from("tracking_identities")
        .insert({
          workspace_id: ws,
          anon_id: input.anonId,
          lead_id: null,
          email,
          phone,
          first_utm: input.utm,
          last_utm: input.utm,
          first_seen_at: nowIso,
          last_seen_at: nowIso,
        })
        .select("id, lead_id, first_utm")
        .single();

      if (!identityInsertError && insertedIdentity) {
        identity = insertedIdentity as IdentityRow;
      } else if (String((identityInsertError as { code?: string } | null)?.code) === "23505") {
        const { data: concurrentIdentity, error: concurrentIdentityError } = await admin
          .from("tracking_identities")
          .select("id, lead_id, first_utm")
          .eq("workspace_id", ws)
          .eq("anon_id", input.anonId)
          .maybeSingle();
        if (concurrentIdentityError || !concurrentIdentity) {
          throw new Error(
            `Tracking identity race recovery failed: ${concurrentIdentityError?.message ?? "identity not found"}`,
          );
        }
        identity = concurrentIdentity as IdentityRow;
      } else {
        throw new Error(identityInsertError?.message ?? "Tracking identity creation returned no row");
      }
    }

    if (!leadId && identity?.lead_id) leadId = identity.lead_id;
  }

  // 2) por e-mail / telefone
  if (!leadId && email) {
    const { data, error } = await admin
      .from("leads")
      .select("id, custom_data")
      .eq("workspace_id", ws)
      .ilike("email", email)
      .limit(1);
    if (error) throw new Error(`Tracking email lead lookup failed: ${error.message}`);
    acceptLead((data?.[0] as LeadLookupRow | undefined) ?? null);
  }
  if (!leadId && phone) {
    const { data, error } = await admin
      .from("leads")
      .select("id, custom_data")
      .eq("workspace_id", ws)
      .eq("phone_normalized", phone)
      .limit(1);
    if (error) throw new Error(`Tracking phone lead lookup failed: ${error.message}`);
    acceptLead((data?.[0] as LeadLookupRow | undefined) ?? null);
  }

  // 3) fallback: qualquer evento anterior do mesmo visitante já identificado
  if (!leadId && input.anonId) {
    const { data, error } = await admin
      .from("tracking_events")
      .select("lead_id")
      .eq("workspace_id", ws)
      .eq("anon_id", input.anonId)
      .not("lead_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(`Tracking previous event lookup failed: ${error.message}`);
    leadId = (data?.[0] as { lead_id: string } | undefined)?.lead_id ?? null;
  }

  // 4) cria o lead quando o visitante se identificou de verdade.
  // O marcador false torna o evento CRM "created" recuperável em uma próxima coleta caso o dispatch falhe.
  if (!leadId && input.createLeadIfMissing && (email || phone)) {
    const initialCustomData = { tracking_crm_created_dispatched: false };
    const { data: newLead, error } = await admin
      .from("leads")
      .insert({
        workspace_id: ws,
        name: input.leadName || email || phone || "Visitante do site",
        email,
        phone,
        source: input.sourceLabel ?? "tracking",
        utm_source: input.utm.utm_source ?? null,
        utm_medium: input.utm.utm_medium ?? null,
        utm_campaign: input.utm.utm_campaign ?? null,
        custom_data: initialCustomData,
      })
      .select("id, custom_data")
      .single();
    if (!error && newLead) {
      const candidate = newLead as LeadLookupRow;

      if (identity) {
        // Compare-and-set: só uma coleta concorrente pode vincular a identidade ao lead recém-criado.
        const { data: claimedIdentity, error: claimError } = await admin
          .from("tracking_identities")
          .update({ lead_id: candidate.id, email: email ?? undefined, phone: phone ?? undefined })
          .eq("id", identity.id)
          .is("lead_id", null)
          .select("id, lead_id, first_utm")
          .maybeSingle();
        if (claimError) throw new Error(`Tracking identity claim failed: ${claimError.message}`);

        if (claimedIdentity) {
          identity = claimedIdentity as IdentityRow;
          acceptLead(candidate);
          pendingCreatedDispatch = true;
          created = true;
        } else {
          // Outra coleta ganhou a corrida. Usa o lead vencedor e remove o candidato órfão.
          const { data: winnerIdentity, error: winnerIdentityError } = await admin
            .from("tracking_identities")
            .select("id, lead_id, first_utm")
            .eq("id", identity.id)
            .maybeSingle();
          if (winnerIdentityError || !winnerIdentity?.lead_id) {
            throw new Error(
              `Tracking identity winner lookup failed: ${winnerIdentityError?.message ?? "winner not found"}`,
            );
          }
          identity = winnerIdentity as IdentityRow;

          const { error: candidateDeleteError } = await admin
            .from("leads")
            .delete()
            .eq("id", candidate.id)
            .eq("workspace_id", ws);
          if (candidateDeleteError)
            throw new Error(`Tracking duplicate lead cleanup failed: ${candidateDeleteError.message}`);

          const { data: winnerLead, error: winnerLeadError } = await admin
            .from("leads")
            .select("id, custom_data")
            .eq("workspace_id", ws)
            .eq("id", winnerIdentity.lead_id)
            .maybeSingle();
          if (winnerLeadError || !winnerLead) {
            throw new Error(`Tracking winner lead lookup failed: ${winnerLeadError?.message ?? "lead not found"}`);
          }
          acceptLead(winnerLead as LeadLookupRow);
        }
      } else {
        acceptLead(candidate);
        pendingCreatedDispatch = true;
        created = true;
      }
    } else {
      // Outra coleta pode ter criado o mesmo lead entre o SELECT e o INSERT.
      // Recupera o registro real no mesmo workspace antes de desistir do evento.
      let recovered: LeadLookupRow | null = null;
      if (email) {
        const { data, error: recoveryError } = await admin
          .from("leads")
          .select("id, custom_data")
          .eq("workspace_id", ws)
          .ilike("email", email)
          .limit(1);
        if (recoveryError) throw new Error(`Tracking lead recovery by email failed: ${recoveryError.message}`);
        recovered = (data?.[0] as LeadLookupRow | undefined) ?? null;
      }
      if (!recovered && phone) {
        const { data, error: recoveryError } = await admin
          .from("leads")
          .select("id, custom_data")
          .eq("workspace_id", ws)
          .eq("phone_normalized", phone)
          .limit(1);
        if (recoveryError) throw new Error(`Tracking lead recovery by phone failed: ${recoveryError.message}`);
        recovered = (data?.[0] as LeadLookupRow | undefined) ?? null;
      }
      if (recovered) {
        acceptLead(recovered);
      } else {
        throw new Error(error?.message ?? "Tracking lead creation returned no row");
      }
    }
  }

  if (leadId && pendingCreatedDispatch) {
    const { dispatchCrmLeadCreated } = await import("@/lib/crm-event-dispatch.server");
    await dispatchCrmLeadCreated(admin as never, { workspaceId: ws, leadId });
    leadCustomData = { ...leadCustomData, tracking_crm_created_dispatched: true };
    const { error: dispatchMarkerError } = await admin
      .from("leads")
      .update({ custom_data: leadCustomData })
      .eq("id", leadId)
      .eq("workspace_id", ws);
    if (dispatchMarkerError)
      throw new Error(`Tracking CRM created marker update failed: ${dispatchMarkerError.message}`);
    pendingCreatedDispatch = false;
  }

  // 5) atualiza identidade + atribuição first/last touch. A criação da linha aconteceu no início.
  if (input.anonId && identity) {
    const nowIso = new Date().toISOString();
    const hasUtm = Object.values(input.utm).some(Boolean);
    const { error: identityUpdateError } = await admin
      .from("tracking_identities")
      .update({
        lead_id: leadId ?? identity.lead_id,
        email: email ?? undefined,
        phone: phone ?? undefined,
        last_seen_at: nowIso,
        ...(hasUtm ? { last_utm: input.utm } : {}),
      })
      .eq("id", identity.id);
    if (identityUpdateError)
      throw new Error(`Tracking identity update failed: ${identityUpdateError.message}`);
  }

  // 6) backfill dos eventos anônimos anteriores do mesmo visitante
  let backfilled = 0;
  if (leadId && input.anonId) {
    const { count, error: backfillError } = await admin
      .from("tracking_events")
      .update({ lead_id: leadId }, { count: "exact" })
      .eq("workspace_id", ws)
      .eq("anon_id", input.anonId)
      .is("lead_id", null);
    if (backfillError) throw new Error(`Tracking event backfill failed: ${backfillError.message}`);
    backfilled = count ?? 0;
  }

  return { leadId, created, backfilled };
}
