import { createFileRoute } from "@tanstack/react-router";
import { TutorialsPage } from "@/components/tutorials/TutorialsPage";

export const Route = createFileRoute("/tutoriais")({
  ssr: false,
  head: () => ({ meta: [{ title: "Tutoriais · Vanessa Simoni" }] }),
  component: TutorialsPage,
});
