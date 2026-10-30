export const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeRecoveryCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function hashRecoveryCode(code: string, email: string) {
  const data = new TextEncoder().encode(`${normalizeRecoveryCode(code)}:${email.trim().toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function makeRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}
