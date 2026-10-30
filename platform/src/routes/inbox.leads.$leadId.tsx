import { createFileRoute } from "@tanstack/react-router";
import { InboxPage } from "@/components/inbox/InboxPage";
import {SlimContactRouteGate} from "@/components/inbox/SlimContactRouteGate";
import { InboxLeadRouteEnhancements } from "@/components/inbox/InboxLeadRouteEnhancements";

export const Route = createFileRoute("/inbox/leads/$leadId")({
  head: () => ({ meta: [{ title: "Chat Lead · Inbox Vanessa Simoni" }] }),
  component: LeadChat,
});

function LeadChat() {
  const { leadId } = Route.useParams();
  return (
    <SlimContactRouteGate leadId={leadId}><div className="relative w-full min-w-0">
      <InboxPage channel="leads" selectedId={leadId} />
      <InboxLeadRouteEnhancements leadId={leadId} />
    </div></SlimContactRouteGate>
  );
}

// SLIM_CONTACT_IDENTITY_V1
