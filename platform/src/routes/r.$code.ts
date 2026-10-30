import { createFileRoute } from "@tanstack/react-router";

const MKTON_ADMIN_WORKSPACE_SLUG = "ruanandradenegocios.mkton";
const REFERRAL_WINDOW_SECONDS = 24 * 60 * 60;
const safeText = (value: string | null, max = 160) => (value ?? "").trim().slice(0, max) || null;
const safeTarget = (value: string | null) => { const target = value?.trim() || "/contas"; return target.startsWith("/") && !target.startsWith("//") ? target : "/contas"; };
const trackingSlug = (code: string) => `pp-${code}`.slice(0, 80);

export const Route = createFileRoute("/r/$code")({
  server: { handlers: { GET: async ({ params, request }) => {
    const code = (params.code ?? "").trim().toLowerCase();
    if (!/^[a-z0-9-]{4,76}$/.test(code)) return new Response("Link inválido.", { status: 404 });
    const url = new URL(request.url);
    const target = safeTarget(url.searchParams.get("to"));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: referralCode, error: codeError } = await admin.from("partner_program_referral_codes").select("user_id,role,code,active").eq("code", code).eq("active", true).maybeSingle();
    if (codeError || !referralCode?.user_id || !referralCode?.role) return new Response("Link inválido.", { status: 404 });
    const { data: eligibleRole } = await admin.from("partner_program_roles").select("id").eq("user_id", referralCode.user_id).eq("role", referralCode.role).eq("status", "approved").maybeSingle();
    if (!eligibleRole?.id) return new Response("Link inválido.", { status: 404 });

    const utmSource = safeText(url.searchParams.get("utm_source")) ?? "partners";
    const utmMedium = safeText(url.searchParams.get("utm_medium")) ?? referralCode.role;
    const utmCampaign = safeText(url.searchParams.get("utm_campaign"));
    const utmContent = safeText(url.searchParams.get("utm_content"));
    const { data: visit, error: visitError } = await admin.from("partner_program_referral_visits").insert({ referrer_user_id: referralCode.user_id, referral_code: referralCode.code, role_snapshot: referralCode.role, utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign, utm_content: utmContent, landing_path: target, expires_at: new Date(Date.now() + REFERRAL_WINDOW_SECONDS * 1000).toISOString() }).select("visitor_token").single();
    if (visitError || !visit?.visitor_token) return new Response("Não foi possível abrir este link agora.", { status: 503 });

    const { data: workspace } = await admin.from("workspaces").select("id").eq("slug", MKTON_ADMIN_WORKSPACE_SLUG).maybeSingle();
    if (!workspace?.id) return new Response("Não foi possível abrir este link agora.", { status: 503 });
    const slug = trackingSlug(referralCode.code);
    const { error: linkError } = await admin.from("tracked_links").upsert({ workspace_id: workspace.id, slug, target_url: "/auth", context_label: "partner_program", link_label: referralCode.role, utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign, utm_content: utmContent }, { onConflict: "slug" });
    if (linkError) return new Response("Não foi possível abrir este link agora.", { status: 503 });
    const { error: clickError } = await admin.from("tracking_events").insert({ workspace_id: workspace.id, event_name: "link_click", page_path: `/r/${referralCode.code}`, utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign, utm_content: utmContent, source_class: "cliente", props: { tracked_link_slug: slug, attribution_token: String(visit.visitor_token), partner_program_referral: true, partner_program_role: referralCode.role } });
    if (clickError) return new Response("Não foi possível abrir este link agora.", { status: 503 });

    const signupUrl = new URL("/auth", url.origin);
    signupUrl.searchParams.set("mode", "signup");
    signupUrl.searchParams.set("mkt_link", slug);
    signupUrl.searchParams.set("mkt_attr", String(visit.visitor_token));
    signupUrl.searchParams.set("next", target);
    const response = Response.redirect(signupUrl, 302);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } } },
});
