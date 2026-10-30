import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/oauth/microsoft/callback")({
  server: {
    handlers: {
      GET: async () =>
        new Response("Microsoft integration retired", {
          status: 410,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
    },
  },
});
