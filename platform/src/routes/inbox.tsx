import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppSidebar } from "@/components/dashboard/AppSidebar";

export const Route = createFileRoute("/inbox")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/inbox" || location.pathname === "/inbox/") {
      throw redirect({ to: "/inbox/leads" });
    }
  },
  component: InboxLayout,
});

function InboxLayout() {
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <AppSidebar />
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
