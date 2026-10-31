import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { SlimErpWorkspace } from "@/components/erp/SlimErpWorkspace";
import { VanessaFinancePanel } from "@/components/erp/VanessaFinancePanel";
export const Route = createFileRoute("/pedidos")({
  ssr: false,
  head: () => ({ meta: [{ title: "Negociações · Vanessa Simoni" }] }),
  component: NegotiationsPage,
});
function NegotiationsPage() {
  const [view, setView] = useState<"finance" | "record">("finance");
  return (
    <div className="flex min-h-[100dvh] bg-background text-foreground md:h-screen md:overflow-hidden">
      <AppSidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
          <div
            role="tablist"
            aria-label="Gestão de negociações"
            className="flex gap-2 border-b pb-3"
          >
            <button
              role="tab"
              aria-selected={view === "finance"}
              onClick={() => setView("finance")}
              className={
                "rounded-md px-4 py-2 text-sm " +
                (view === "finance" ? "bg-primary text-primary-foreground" : "border")
              }
            >
              VGV e comissões
            </button>
            <button
              role="tab"
              aria-selected={view === "record"}
              onClick={() => setView("record")}
              className={
                "rounded-md px-4 py-2 text-sm " +
                (view === "record" ? "bg-primary text-primary-foreground" : "border")
              }
            >
              Registrar negociação
            </button>
          </div>
          {view === "finance" ? <VanessaFinancePanel /> : <SlimErpWorkspace mode="checkout" />}
        </div>
      </main>
    </div>
  );
}
