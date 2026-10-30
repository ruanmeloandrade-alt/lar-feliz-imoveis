/** Utilitários de lista de IPs permitidos (IPv4 + CIDR, IPv6 exato). */

export type IpRule = { raw: string; ok: boolean };

export function parseIpList(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function ipv4ToInt(ip: string): number | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const part of p) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const v = Number(part);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

/** Valida uma entrada: IPv4, IPv4/CIDR ou IPv6 simples. */
export function isValidEntry(entry: string): boolean {
  const [addr, mask] = entry.split("/");
  if (mask !== undefined) {
    const m = Number(mask);
    if (!Number.isInteger(m) || m < 0 || m > 32) return false;
    return ipv4ToInt(addr ?? "") !== null;
  }
  if (ipv4ToInt(entry) !== null) return true;
  return /^[0-9a-f:]+$/i.test(entry) && entry.includes(":");
}

/** O IP informado está autorizado pela lista? Lista vazia = ninguém autorizado. */
export function ipAllowed(ip: string | null, list: string[]): boolean {
  if (!ip) return false;
  const clean = ip.trim().replace(/^::ffff:/i, "");
  const ipInt = ipv4ToInt(clean);
  for (const rawEntry of list) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const [addr, mask] = entry.split("/");
    if (mask !== undefined && ipInt !== null) {
      const base = ipv4ToInt(addr ?? "");
      const bits = Number(mask);
      if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) continue;
      const m = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      if ((ipInt & m) === (base & m)) return true;
      continue;
    }
    if (entry.toLowerCase() === clean.toLowerCase()) return true;
  }
  return false;
}

/** Heurística simples: celular/tablet (IP volátil) fica fora da regra de IP. */
export function isMobileAgent(ua: string | null): boolean {
  if (!ua) return false;
  return /Android|iPhone|iPad|iPod|Mobile Safari|Opera Mini|Windows Phone/i.test(ua);
}
