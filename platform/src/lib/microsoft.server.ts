// Compatibility tombstone for the retired Microsoft integration.
// This module intentionally performs no OAuth, Graph, database, or network work.

export type SbRpc = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};
export type AnySb = SbRpc & { from: (table: string) => any };

export const MICROSOFT_PROVIDER = "microsoft";
export const GRAPH = "https://graph.microsoft.com/v1.0";
export const MICROSOFT_PRODUCTS = [] as const;
export const MICROSOFT_BASE_SCOPES = [] as const;
export const MICROSOFT_PRODUCT_SCOPES: Record<string, readonly string[]> = {};
export const MICROSOFT_SCOPES: string[] = [];

export interface MicrosoftSecret {
  client_id?: string;
  client_secret?: string;
  tenant?: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  scope?: string;
  email?: string;
  display_name?: string;
  products?: string[];
}

export interface MicrosoftAppConfig {
  clientId: string;
  clientSecret: string;
  tenant: string;
  source: "platform" | "legacy";
}

export interface MsUser {
  id?: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
}

export interface MsFile {
  id: string;
  name: string;
  size: number;
  webUrl: string;
  isFolder: boolean;
  lastModified: string;
  kind: "excel" | "word" | "powerpoint" | "pasta" | "arquivo";
}

export interface MsSharePointSite {
  id: string;
  name: string;
  displayName: string;
  webUrl: string;
}

export interface MsDriveRef {
  id: string;
  name: string;
  webUrl: string;
}

export interface MsMessage {
  id: string;
  subject: string;
  from: string;
  received: string;
  preview: string;
  isRead: boolean;
  webLink: string;
}

export interface MsEvent {
  id: string;
  subject: string;
  start: string;
  end: string;
  location: string;
  webLink: string;
}

const retired = (): never => {
  throw new Error("Microsoft integration retired");
};

export function microsoftScopesForProducts(): string[] {
  return [];
}

export function microsoftScopeGranted(): boolean {
  return false;
}

export function encKey(): string {
  return "retired";
}

export async function activeWorkspace(): Promise<string> {
  return retired();
}

export function microsoftPlatformEnvReady(): boolean {
  return false;
}

export function microsoftAppConfig(): MicrosoftAppConfig {
  return retired();
}

export async function readMicrosoftSecret(): Promise<MicrosoftSecret> {
  return retired();
}

export async function readMicrosoftSecretSafe(): Promise<MicrosoftSecret | null> {
  return null;
}

export async function writeMicrosoftSecret(): Promise<void> {
  retired();
}

export function buildMicrosoftAuthUrl(): string {
  return retired();
}

export async function exchangeMicrosoftCode(): Promise<never> {
  return retired();
}

export async function refreshMicrosoftToken(): Promise<never> {
  return retired();
}

export async function getMicrosoftAccessToken(): Promise<{ token: string; secret: MicrosoftSecret }> {
  return retired();
}

export async function graphFetch<T>(): Promise<T> {
  return retired();
}

export async function microsoftMe(): Promise<MsUser> {
  return retired();
}

export async function listDriveFiles(): Promise<MsFile[]> {
  return [];
}

export async function searchDriveFiles(): Promise<MsFile[]> {
  return [];
}

export async function listFollowedSharePointSites(): Promise<MsSharePointSite[]> {
  return [];
}

export async function listSharePointDrives(): Promise<MsDriveRef[]> {
  return [];
}

export async function listDriveRootFiles(): Promise<MsFile[]> {
  return [];
}

export async function listWorksheets(): Promise<Array<{ id: string; name: string }>> {
  return [];
}

export async function readWorksheetRange(): Promise<string[][]> {
  return [];
}

export async function writeWorksheetRange(): Promise<{ ok: true }> {
  return { ok: true };
}

export async function listMessages(): Promise<MsMessage[]> {
  return [];
}

export async function sendMail(): Promise<{ ok: true }> {
  return retired();
}

export async function listEvents(): Promise<MsEvent[]> {
  return [];
}

export async function createEvent(): Promise<{ id: string; webLink: string }> {
  return retired();
}

export async function listTeams(): Promise<Array<{ id: string; name: string; description: string }>> {
  return [];
}

export async function listContacts(): Promise<Array<{ id: string; name: string; email: string; phone: string }>> {
  return [];
}

export async function buildMicrosoftState(): Promise<string> {
  return retired();
}

export async function verifyMicrosoftState(): Promise<{ ws: string; t: number } | null> {
  return null;
}

export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
