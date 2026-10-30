import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/oauth/google/diagnose")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const g = await import("@/lib/google.server");
          const ready = g.googleEnvReady();
          return Response.json(
            { ok: ready, ready, stage: "server_env" },
            { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Response.json(
            { ok: false, ready: false, stage: "server_env", error: message },
            { status: 500, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
