import { createFileRoute } from "@tanstack/react-router";
import { EmailInboxPage } from "@/components/inbox/EmailInboxPage";

export const Route = createFileRoute("/inbox/email/")({
  head: () => ({ meta: [{ title: "Inbox · E-mail · Vanessa Simoni" }] }),
  component: () => <EmailInboxPage />,
});
