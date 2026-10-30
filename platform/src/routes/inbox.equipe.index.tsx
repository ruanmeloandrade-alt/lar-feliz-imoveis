import { createFileRoute } from "@tanstack/react-router";
import { TeamChatPage } from "@/components/inbox/TeamChatPage";

export const Route = createFileRoute("/inbox/equipe/")({
  head: () => ({
    meta: [
      { title: "Chat Equipe · Vanessa Simoni" },
      { name: "description", content: "Converse com seu setor e com colegas dentro do Vanessa Simoni." },
      { property: "og:title", content: "Chat Equipe · Vanessa Simoni" },
      { property: "og:description", content: "Chat por setor e conversas individuais da sua equipe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <TeamChatPage />,
});
