/**
 * Aprovação de novo dispositivo por WhatsApp (RB Mídia).
 * Server-only: gera/valida códigos e dispara a mensagem pela instância oficial.
 */
import { sendEvolutionMessage } from "@/lib/whatsapp-calls.server";

type AnySb = { from: (t: string) => any; rpc: (fn: string, args?: any) => any };

export function generateCode(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return String(n).padStart(6, "0");
}

export async function hashCode(code: string, salt: string): Promise<string> {
  const buf = new TextEncoder().encode(`${salt}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length < 6) return "•••";
  return `•••••${d.slice(-4)}`;
}

/**
 * Envia o código pela instância WhatsApp da RB Mídia (workspace administrativo).
 * Se ela não estiver configurada, usa a instância conectada do próprio workspace.
 */
export async function sendApprovalCode(
  admin: AnySb,
  phone: string,
  code: string,
  region: string | null,
  fallbackWorkspaceId?: string | null,
) {
  const adminWs = process.env["MKTON_ADMIN_WORKSPACE_ID"];
  const key = process.env["INTEGRATION_ENCRYPTION_KEY"];
  if (!key) return false;

  const pickSession = async (wsId: string) => {
    const { data } = await admin
      .from("whatsapp_web_sessions")
      .select("id")
      .eq("workspace_id", wsId)
      .eq("status", "conectado")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as { id?: string } | null)?.id ?? null;
  };

  let sessionId: string | null = adminWs ? await pickSession(adminWs) : null;
  if (!sessionId && fallbackWorkspaceId) sessionId = await pickSession(fallbackWorkspaceId);
  if (!sessionId) return false;



  const { data: creds } = await admin.rpc("get_evolution_credentials_service", {
    _session_id: sessionId,
    _key: key,
  });
  const c = creds as { instance_name?: string; api_key?: string } | null;
  if (!c?.instance_name || !c?.api_key) return false;

  const local = region ? ` a partir de *${region}*` : "";
  const text =
    `*RB Mídia • MKTOn*\n\n` +
    `Detectamos um acesso à sua conta em um novo dispositivo${local}.\n\n` +
    `Seu código de liberação é: *${code}*\n\n` +
    `Ele expira em 10 minutos. Se não foi você, ignore esta mensagem — o acesso continua bloqueado sem o código.`;

  return sendEvolutionMessage({
    instanceId: c.instance_name,
    apiKey: c.api_key,
    number: phone.replace(/\D/g, ""),
    text,
  });
}
