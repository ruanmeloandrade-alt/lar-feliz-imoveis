import { createFileRoute } from "@tanstack/react-router";
import { InboxPage } from "@/components/inbox/InboxPage";

export const Route = createFileRoute("/inbox/leads/")({
  head: () => ({ meta: [{ title: "Inbox · Vanessa Simoni" }] }),
  component: () => <InboxPage channel="leads" />,
});
