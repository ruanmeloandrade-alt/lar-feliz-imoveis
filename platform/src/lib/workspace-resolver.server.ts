type BackendError = { message?: string | null } | null | undefined;

export type WorkspaceResolverClient = {
  from: (table: string) => any;
};

function cleanBackendMessage(error: unknown) {
  const backendMessage = error && typeof error === "object"
    ? (error as { message?: unknown }).message
    : undefined;
  const raw = typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : typeof backendMessage === "string"
        ? backendMessage
        : "";

  if (/<!doctype html|<html|connection timed out|error code 522/i.test(raw)) {
    return "Backend temporariamente indisponível. Tente novamente em instantes.";
  }

  return raw || "Não foi possível acessar o workspace ativo.";
}

async function saveCurrentWorkspace(supabase: WorkspaceResolverClient, userId: string, workspaceId: string) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      { id: userId, current_workspace_id: workspaceId },
      { onConflict: "id" },
    );
  if (error) throw new Error(cleanBackendMessage(error));
}

async function hasWorkspaceAccess(
  supabase: WorkspaceResolverClient,
  userId: string,
  workspaceId: string,
) {
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, access_expires_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (membershipError) throw new Error(cleanBackendMessage(membershipError));
  if (membership?.workspace_id) {
    const expiresAt = (membership as { access_expires_at?: string | null }).access_expires_at;
    if (!expiresAt || new Date(expiresAt).getTime() > Date.now()) return true;
    // Membership vencida deixa de ser acesso válido imediatamente. A remoção é
    // tentada como limpeza; a negação de acesso não depende do delete funcionar.
    await supabase
      .from("workspace_members")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId);
    return false;
  }

  // Compatibilidade com workspaces legados cujo owner ainda não possua uma linha
  // em workspace_members. O owner continua sendo uma identidade de acesso válida.
  const { data: owned, error: ownerError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle();
  if (ownerError) throw new Error(cleanBackendMessage(ownerError));
  return Boolean(owned?.id);
}

async function findWorkspaceFromMembership(supabase: WorkspaceResolverClient, userId: string) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, access_expires_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(cleanBackendMessage(error));
  const memberships = (data ?? []) as Array<{ workspace_id?: string; access_expires_at?: string | null }>;
  const active = memberships.find((membership) => {
    if (!membership.workspace_id) return false;
    if (!membership.access_expires_at) return true;
    return new Date(membership.access_expires_at).getTime() > Date.now();
  });
  return active?.workspace_id ?? null;
}

async function findOwnedWorkspace(supabase: WorkspaceResolverClient, userId: string) {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(cleanBackendMessage(error));
  return (data as { id?: string } | null)?.id ?? null;
}

async function createPersonalWorkspace(supabase: WorkspaceResolverClient, userId: string) {
  const suffix = `${userId.slice(0, 8)}-${Date.now().toString(36)}`.toLowerCase();
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .insert({
      slug: `workspace-${suffix}`,
      name: "Meu workspace",
      owner_id: userId,
    })
    .select("id")
    .single();

  if (workspaceError) throw new Error(cleanBackendMessage(workspaceError));
  const workspaceId = (workspace as { id?: string } | null)?.id;
  if (!workspaceId) throw new Error("Não foi possível criar o workspace inicial.");

  const { error: memberError } = await supabase
    .from("workspace_members")
    .insert({ workspace_id: workspaceId, user_id: userId, role: "owner" });
  if (memberError) throw new Error(cleanBackendMessage(memberError));

  await saveCurrentWorkspace(supabase, userId, workspaceId);
  return workspaceId;
}

export async function resolveActiveWorkspace(
  supabase: WorkspaceResolverClient,
  userId: string,
  options: { createIfMissing?: boolean } = {},
) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new Error(cleanBackendMessage(profileError));

  const currentWorkspaceId = (profile as { current_workspace_id?: string } | null)?.current_workspace_id;
  if (currentWorkspaceId && await hasWorkspaceAccess(supabase, userId, currentWorkspaceId)) {
    return currentWorkspaceId;
  }

  const memberWorkspaceId = await findWorkspaceFromMembership(supabase, userId);
  if (memberWorkspaceId) {
    if (memberWorkspaceId !== currentWorkspaceId) {
      await saveCurrentWorkspace(supabase, userId, memberWorkspaceId);
    }
    return memberWorkspaceId;
  }

  const ownedWorkspaceId = await findOwnedWorkspace(supabase, userId);
  if (ownedWorkspaceId) {
    if (ownedWorkspaceId !== currentWorkspaceId) {
      await saveCurrentWorkspace(supabase, userId, ownedWorkspaceId);
    }
    return ownedWorkspaceId;
  }

  if (options.createIfMissing) return createPersonalWorkspace(supabase, userId);
  return null;
}

export async function requireActiveWorkspace(
  supabase: WorkspaceResolverClient,
  userId: string,
  options: { createIfMissing?: boolean } = { createIfMissing: true },
) {
  const workspaceId = await resolveActiveWorkspace(supabase, userId, options);
  if (!workspaceId) throw new Error("Workspace ativo não encontrado.");
  return workspaceId;
}

export function formatWorkspaceError(error: unknown) {
  return cleanBackendMessage(error);
}
