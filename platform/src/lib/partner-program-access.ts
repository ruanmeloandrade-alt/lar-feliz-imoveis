import { supabase } from "@/integrations/supabase/client";
import {
  buildPartnerProgramDestinations,
  type PartnerProgramDestination,
  type PartnerProgramRoleStatus,
} from "@/lib/partner-program-entry";

export type PartnerProgramAccessSnapshot = {
  authenticated: boolean;
  userId: string | null;
  isAdmin: boolean;
  statuses: PartnerProgramRoleStatus[];
  destinations: PartnerProgramDestination[];
  affiliate: boolean;
  partner: boolean;
};

export async function loadPartnerProgramAccess(): Promise<PartnerProgramAccessSnapshot> {
  if (typeof window === "undefined") {
    return {
      authenticated: false,
      userId: null,
      isAdmin: false,
      statuses: [],
      destinations: [],
      affiliate: false,
      partner: false,
    };
  }

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user?.id) {
    return {
      authenticated: false,
      userId: null,
      isAdmin: false,
      statuses: [],
      destinations: [],
      affiliate: false,
      partner: false,
    };
  }

  const userId = auth.user.id;
  const [rolesResult, adminResult] = await Promise.all([
    (supabase as any)
      .from("partner_program_roles")
      .select("role,status")
      .eq("user_id", userId),
    (supabase as any).rpc("partner_program_is_admin", { _user_id: userId }),
  ]);

  const statuses: PartnerProgramRoleStatus[] = rolesResult.error
    ? []
    : (Array.isArray(rolesResult.data) ? rolesResult.data : [])
      .filter((item: any) => item?.role === "affiliate" || item?.role === "partner")
      .map((item: any) => ({ role: item.role, status: String(item.status ?? "") }));

  const isAdmin = !adminResult.error && adminResult.data === true;
  const destinations = buildPartnerProgramDestinations(statuses, isAdmin);

  return {
    authenticated: true,
    userId,
    isAdmin,
    statuses,
    destinations,
    affiliate: destinations.some((item) => item.role === "affiliate"),
    partner: destinations.some((item) => item.role === "partner"),
  };
}
