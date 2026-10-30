import { createFileRoute, notFound } from "@tanstack/react-router";
export const Route = createFileRoute("/f/$slug")({
  beforeLoad: () => {
    throw notFound();
  },
});
