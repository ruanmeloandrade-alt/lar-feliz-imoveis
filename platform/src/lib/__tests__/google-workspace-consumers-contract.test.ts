import { describe, expect, it } from "vitest";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

describe("Google Workspace consumers #47", () => {
  it("uses real Google Workspace endpoints server-side", () => {
    const src = read("src/lib/google-workspace.server.ts");
    expect(src).toContain("https://www.googleapis.com/drive/v3");
    expect(src).toContain("https://www.googleapis.com/calendar/v3");
    expect(src).toContain("https://docs.googleapis.com/v1");
    expect(src).toContain("https://sheets.googleapis.com/v4");
    expect(src).toContain("driveListFiles");
    expect(src).toContain("calendarCreateEvent");
    expect(src).toContain("docsReadText");
    expect(src).toContain("sheetsReadValues");
  });

  it("turns calendar pending state into a real Google Calendar call", () => {
    const src = read("src/lib/tasks.functions.ts");
    expect(src).toContain("calendarCreateEvent");
    expect(src).toContain('external_source: "google"');
    expect(src).toContain('google_sync_status: "synced"');
    expect(src).toContain('google_sync_status: "error"');
    expect(src).toContain('.eq("workspace_id", wsId)');
  });

  it("feeds Google Drive into the existing CRM files central", () => {
    const src = read("src/lib/crm-arquivos.functions.ts");
    expect(src).toContain("driveListFiles");
    expect(src).toContain('"google_drive"');
    expect(src).toContain("readGoogleSecretSafe(sb, wsId)");
    expect(src).toContain("getGoogleAccessToken(sb, wsId, secret)");
    expect(src).toContain("id: `gdrive:${file.id}`");
  });

  it("checks the granted scopes before consuming Calendar or Drive", () => {
    const tasks = read("src/lib/tasks.functions.ts");
    const files = read("src/lib/crm-arquivos.functions.ts");
    expect(tasks).toContain("https://www.googleapis.com/auth/calendar");
    expect(tasks).toContain("googleScopeGranted(secret, calendarScope)");
    expect(files).toContain("https://www.googleapis.com/auth/drive");
    expect(files).toContain("googleScopeGranted(secret, driveScope)");
  });
});
