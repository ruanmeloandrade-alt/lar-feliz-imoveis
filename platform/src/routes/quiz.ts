import { createFileRoute } from "@tanstack/react-router";
import quizDocument from "../lib/lobo-quiz-document.html?raw";

const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-cache",
};

export const Route = createFileRoute("/quiz")({
  server: {
    handlers: {
      GET: () => new Response(quizDocument, { headers }),
      HEAD: () => new Response(null, { headers }),
    },
  },
});
