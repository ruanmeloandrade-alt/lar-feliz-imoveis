import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolvePartnerProgramEntry } from "@/lib/partner-program-entry";

export const Route = createFileRoute("/afiliados")({
  component: AffiliateLegacyEntry,
});

function AffiliateLegacyEntry() {
  const [message, setMessage] = useState("Abrindo sua área de Afiliado...");

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id;

        if (!userId) {
          window.location.replace("/partners?role=affiliate");
          return;
        }

        const [{ data: roles, error: rolesError }, { data: isAdmin, error: adminError }] = await Promise.all([
          (supabase as any)
            .from("partner_program_roles")
            .select("role,status")
            .eq("user_id", userId),
          (supabase as any).rpc("partner_program_is_admin", { _user_id: userId }),
        ]);

        if (!active) return;
        if (rolesError) throw rolesError;
        if (adminError) throw adminError;

        const destination = resolvePartnerProgramEntry({
          authenticated: true,
          role: "affiliate",
          statuses: Array.isArray(roles) ? roles : [],
          isAdmin: isAdmin === true,
        });

        if (destination.kind === "dashboard") {
          window.location.replace(
            destination.adminPreview ? `${destination.href}?preview=admin` : destination.href,
          );
          return;
        }

        window.location.replace(`${destination.href}?role=${destination.role}`);
      } catch (error) {
        console.error("[partners] legacy affiliate entry resolution failed", error);
        if (active) {
          setMessage("Não foi possível confirmar seu acesso. Abra o seletor de contas para tentar novamente.");
          window.location.replace("/contas");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm font-semibold text-slate-600">{message}</p>
      </div>
    </main>
  );
}
