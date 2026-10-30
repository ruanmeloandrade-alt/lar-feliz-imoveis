import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => fs.readFileSync(path, "utf8");

describe("Chat E-mail real", () => {
  it("does not ship mock messages or fake local connection state", () => {
    const ui = read("src/components/inbox/EmailInboxPage.tsx");
    expect(ui).not.toContain("MOCK_EMAILS");
    expect(ui).not.toContain("setConnected(true)");
    expect(ui).toContain("getEmailInboxStatus");
    expect(ui).toContain("listEmailInboxMessages");
    expect(ui).toContain("sendEmailInboxMessage");
  });

  it("reads Gmail and Microsoft through the real workspace integrations", () => {
    const server = read("src/lib/email-inbox.functions.ts");
    expect(server).toContain("gmail.googleapis.com/gmail/v1/users/me");
    expect(server).toContain("readGoogleSecret");
    expect(server).toContain("getGoogleAccessToken");
    expect(server).toContain("readMicrosoftSecret");
    expect(server).toContain("getMicrosoftAccessToken");
    expect(server).toContain("graphFetch");
  });

  it("uses the shared email sender instead of a second delivery path", () => {
    const server = read("src/lib/email-inbox.functions.ts");
    expect(server).toContain("sender.sendWorkspaceEmail");
    expect(server).toContain("startGmailInboxAuthorization");
    expect(server).toContain("buildGoogleState");
    expect(server).toContain("buildGoogleAuthUrl");
  });

  it("keeps outbound providers honest about not being inbox providers", () => {
    const ui = read("src/components/inbox/EmailInboxPage.tsx");
    expect(ui).toContain("não representa uma caixa postal de entrada");
    expect(ui).toContain("SalesBot, automações e campanhas");
  });
});
