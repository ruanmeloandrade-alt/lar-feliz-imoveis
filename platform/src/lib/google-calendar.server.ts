// Criação de eventos no Google Agenda do workspace (integração Google já
// conectada em Integrações → Conta Google, escopo calendar).

import { getGoogleAccessToken, readGoogleSecretSafe } from "@/lib/google.server";

type AnySb = { from: (t: string) => any; rpc?: (fn: string, args: unknown) => any };

export interface CalendarEventInput {
  summary: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  attendeeEmail?: string | null;
  meetingUrl?: string | null;
}

/**
 * Cria o evento na agenda principal da conta Google conectada.
 * Retorna o id do evento ou null quando o workspace não tem Google conectado.
 */
export async function createGoogleCalendarEvent(
  sb: AnySb,
  workspaceId: string,
  input: CalendarEventInput,
): Promise<string | null> {
  const secret = await readGoogleSecretSafe(sb as never, workspaceId);
  if (!secret) return null;
  const products = Array.isArray(secret.products) ? secret.products : [];
  if (products.length && !products.includes("calendar")) return null;

  const { token } = await getGoogleAccessToken(sb as never, workspaceId, secret);

  const body: Record<string, unknown> = {
    summary: input.summary,
    description: [input.description, input.meetingUrl].filter(Boolean).join("\n") || undefined,
    start: { dateTime: input.startsAt, timeZone: "America/Sao_Paulo" },
    end: { dateTime: input.endsAt, timeZone: "America/Sao_Paulo" },
  };
  if (input.meetingUrl) body.location = input.meetingUrl;
  if (input.attendeeEmail) body.attendees = [{ email: input.attendeeEmail }];

  const r = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const txt = await r.text();
  if (!r.ok) throw new Error(`Google Agenda falhou (${r.status}): ${txt.slice(0, 300)}`);
  const json = JSON.parse(txt) as { id?: string };
  return json.id ?? null;
}
