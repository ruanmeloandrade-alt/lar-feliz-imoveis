import type { GoogleSecret } from "./google.server.base";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const DOCS_API = "https://docs.googleapis.com/v1";
const SHEETS_API = "https://sheets.googleapis.com/v4";

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  createdTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  size?: string;
}

export interface GoogleDrivePage {
  files: GoogleDriveFile[];
  nextPageToken: string | null;
}

export interface GoogleCalendarEventInput {
  summary: string;
  description?: string | null;
  start: string;
  end: string;
  timeZone?: string | null;
  location?: string | null;
  attendees?: Array<{ email: string; displayName?: string }>;
  reminderMinutes?: number | null;
  meetingUrl?: string | null;
  createGoogleMeet?: boolean;
}

export interface GoogleCalendarEventResult {
  id: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function googleJson<T>(
  url: string,
  token: string,
  init?: RequestInit,
  label = "Google Workspace",
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders(token),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${label} ${response.status}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export function googleScopeGranted(
  secret: GoogleSecret | null | undefined,
  scope: string,
): boolean {
  return new Set((secret?.scope ?? "").split(/\s+/).filter(Boolean)).has(scope);
}

export async function driveListFilesPage(
  token: string,
  pageSize = 200,
  pageToken?: string | null,
): Promise<GoogleDrivePage> {
  const params = new URLSearchParams({
    pageSize: String(Math.max(1, Math.min(1000, pageSize))),
    orderBy: "modifiedTime desc",
    q: "trashed = false",
    fields: "nextPageToken,files(id,name,mimeType,modifiedTime,createdTime,webViewLink,webContentLink,size)",
  });
  if (pageToken) params.set("pageToken", pageToken);

  const result = await googleJson<{ files?: GoogleDriveFile[]; nextPageToken?: string }>(
    `${DRIVE_API}/files?${params.toString()}`,
    token,
    undefined,
    "Google Drive",
  );
  return {
    files: result.files ?? [],
    nextPageToken: result.nextPageToken ?? null,
  };
}

export async function driveListFiles(token: string, pageSize = 200): Promise<GoogleDriveFile[]> {
  const result = await driveListFilesPage(token, pageSize);
  return result.files;
}

function calendarWallTime(iso: string, timeZone?: string | null) {
  if (!timeZone) return { dateTime: iso };
  return {
    dateTime: iso.replace(/Z$/, ""),
    timeZone,
  };
}

function calendarMeetUrl(event: GoogleCalendarEventResult): string | undefined {
  return event.hangoutLink ?? event.conferenceData?.entryPoints?.find(
    (entry) => entry.entryPointType === "video",
  )?.uri;
}

async function waitForGoogleMeet(
  token: string,
  event: GoogleCalendarEventResult,
): Promise<GoogleCalendarEventResult> {
  let current = event;
  current.hangoutLink = calendarMeetUrl(current);
  if (current.hangoutLink) return current;

  for (const delayMs of [250, 500, 750]) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    current = await googleJson<GoogleCalendarEventResult>(
      `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(event.id)}`,
      token,
      undefined,
      "Google Calendar",
    );
    current.hangoutLink = calendarMeetUrl(current);
    if (current.hangoutLink) return current;
  }
  return current;
}

export async function calendarCreateEvent(
  token: string,
  input: GoogleCalendarEventInput,
): Promise<GoogleCalendarEventResult> {
  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description ?? undefined,
    location: input.location ?? undefined,
    start: calendarWallTime(input.start, input.timeZone),
    end: calendarWallTime(input.end, input.timeZone),
    attendees:
      input.attendees?.map((a) => ({ email: a.email, displayName: a.displayName })) ?? undefined,
  };
  if (input.reminderMinutes != null) {
    body.reminders = {
      useDefault: false,
      overrides: [{ method: "popup", minutes: input.reminderMinutes }],
    };
  }
  if (input.meetingUrl) {
    body.description = [input.description, `Link da reunião: ${input.meetingUrl}`]
      .filter(Boolean)
      .join("\n\n");
  }
  if (input.createGoogleMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const params = new URLSearchParams({ sendUpdates: "all" });
  if (input.createGoogleMeet) params.set("conferenceDataVersion", "1");

  const event = await googleJson<GoogleCalendarEventResult>(
    `${CALENDAR_API}/calendars/primary/events?${params.toString()}`,
    token,
    { method: "POST", body: JSON.stringify(body) },
    "Google Calendar",
  );

  if (input.createGoogleMeet) return waitForGoogleMeet(token, event);
  return event;
}

interface GoogleDocsDocument {
  body?: {
    content?: Array<{
      paragraph?: {
        elements?: Array<{ textRun?: { content?: string } }>;
      };
    }>;
  };
}

export async function docsReadText(token: string, documentId: string): Promise<string> {
  const doc = await googleJson<GoogleDocsDocument>(
    `${DOCS_API}/documents/${encodeURIComponent(documentId)}`,
    token,
    undefined,
    "Google Docs",
  );
  return (doc.body?.content ?? [])
    .flatMap((block) => block.paragraph?.elements ?? [])
    .map((el) => el.textRun?.content ?? "")
    .join("")
    .trim();
}

export async function sheetsReadValues(
  token: string,
  spreadsheetId: string,
  range = "A1:Z200",
): Promise<unknown[][]> {
  const result = await googleJson<{ values?: unknown[][] }>(
    `${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    token,
    undefined,
    "Google Sheets",
  );
  return result.values ?? [];
}
