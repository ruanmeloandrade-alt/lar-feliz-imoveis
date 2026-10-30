// Helpers puros de permissão (usados no server e no cliente).
// Regra: dono do workspace, super_admin e role 'admin' têm carta branca.

import {
  MODULES_MATRIX,
  defaultEntityAccess,
  type CrudAction,
  type LeadScope,
  type UserPermissions,
  type ModuleAccess,
  type EntityAccess,
} from "@/lib/permissions-catalog";

export type EffectiveRole = "owner" | "super_admin" | "admin" | "member";

export interface EffectivePermissions {
  role: EffectiveRole;
  full: boolean;         // bypass total
  permissions: UserPermissions | null;
}

export function isFullAccess(eff: Pick<EffectivePermissions, "role" | "full">) {
  return eff.full || eff.role === "owner" || eff.role === "super_admin" || eff.role === "admin";
}

function getModule(eff: EffectivePermissions, moduleId: string): ModuleAccess | null {
  return eff.permissions?.modules?.[moduleId] ?? null;
}

function getEntity(eff: EffectivePermissions, moduleId: string, entityId: string): EntityAccess {
  const mod = getModule(eff, moduleId);
  return mod?.entities?.[entityId] ?? defaultEntityAccess("none");
}

/** Módulo aparece no menu / dá pra clicar? */
export function moduleEnabled(eff: EffectivePermissions, moduleId: string): boolean {
  if (isFullAccess(eff)) return true;
  const mod = getModule(eff, moduleId);
  return !!mod?.enabled;
}

/** Retorna o escopo (none|assigned|team|all) da ação. */
export function scopeOf(
  eff: EffectivePermissions,
  moduleId: string,
  entityId: string,
  action: CrudAction,
): LeadScope {
  if (isFullAccess(eff)) return "all";
  if (!moduleEnabled(eff, moduleId)) return "none";
  return getEntity(eff, moduleId, entityId)[action];
}

export function can(
  eff: EffectivePermissions,
  moduleId: string,
  entityId: string,
  action: CrudAction,
): boolean {
  return scopeOf(eff, moduleId, entityId, action) !== "none";
}

/**
 * Funis liberados. `null` = acesso total (dono/admin/super_admin).
 * Array vazio = usuário comum sem nenhum funil designado → não vê nada.
 */
export function allowedPipelines(eff: EffectivePermissions, moduleId: string): string[] | null {
  if (isFullAccess(eff)) return null;
  const mod = getModule(eff, moduleId);
  return mod?.pipelines ?? [];
}

/** Etapas liberadas. `null` = todas as etapas dos funis liberados. */
export function allowedStages(eff: EffectivePermissions, moduleId: string): string[] | null {
  if (isFullAccess(eff)) return null;
  const mod = getModule(eff, moduleId);
  const arr = mod?.stages ?? [];
  return arr.length === 0 ? null : arr;
}


export function hasExtra(eff: EffectivePermissions, moduleId: string, extraId: string): boolean {
  if (isFullAccess(eff)) return true;
  const mod = getModule(eff, moduleId);
  return !!mod?.extras?.[extraId];
}

/** Lista de módulos que devem aparecer no menu / na UI. */
export function listVisibleModuleIds(eff: EffectivePermissions): string[] {
  if (isFullAccess(eff)) return MODULES_MATRIX.map((m) => m.id);
  return MODULES_MATRIX.filter((m) => moduleEnabled(eff, m.id)).map((m) => m.id);
}

/** Lança 403 quando negado. Usar no server-side. */
export function requireAllowed(
  eff: EffectivePermissions,
  moduleId: string,
  entityId: string,
  action: CrudAction,
): LeadScope {
  const s = scopeOf(eff, moduleId, entityId, action);
  if (s === "none") {
    const err = new Error(`permission_denied:${moduleId}.${entityId}.${action}`);
    (err as unknown as { status: number }).status = 403;
    throw err;
  }
  return s;
}
