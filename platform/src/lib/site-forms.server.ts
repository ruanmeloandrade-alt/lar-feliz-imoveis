// Leitor de formulários de sites externos.
// Baixa o HTML de uma página pública e identifica <form> + campos,
// para que o cliente possa importar o formulário do próprio site
// sem precisar montar tudo manualmente no CRM.

export interface DetectedField {
  /** name/id do campo no site (usado como chave na ingestão). */
  name: string;
  label: string;
  kind: "text" | "email" | "phone" | "value" | "select" | "file" | "custom";
  required: boolean;
  options?: string[];
}

export interface DetectedForm {
  /** Índice do formulário dentro da varredura (único entre páginas). */
  index: number;
  nome: string;
  action: string | null;
  method: string;
  /** Página em que este formulário foi encontrado. */
  pageUrl: string;
  fields: DetectedField[];
  /**
   * Formulário deduzido (site em JavaScript ou campos soltos, sem tag <form>).
   * Vale conferir os campos antes de importar.
   */
  inferred?: boolean;
  /** Explicação curta de como o formulário foi identificado. */
  note?: string;
}


export interface ScannedPage {
  url: string;
  ok: boolean;
  forms: number;
  note?: string;
}

export interface SiteScanResult {
  url: string;
  title: string | null;
  forms: DetectedForm[];
  /** Provedores de formulário reconhecidos (Elementor, HubSpot, etc.). */
  hints: string[];
  /** Páginas visitadas na varredura. */
  pages: ScannedPage[];
  /** Site parece ser aplicação JavaScript (formulário só existe depois de carregar). */
  spa: boolean;
  /** Formulários embutidos por iframe (Typeform, Google Forms, etc.). */
  embeds: string[];
}


const PRIVATE_HOST =
  /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i;

/** Normaliza e valida a URL informada pelo usuário (bloqueia rede interna). */
export function normalizeSiteUrl(input: string): string {
  const raw = input.trim();
  if (!raw) throw new Error("Informe o endereço do site.");
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    throw new Error("Endereço inválido. Exemplo: https://meusite.com.br/contato");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Use um endereço http ou https.");
  }
  if (PRIVATE_HOST.test(u.hostname)) {
    throw new Error("Endereços internos não podem ser lidos.");
  }
  u.hash = "";
  return u.toString();
}

const MAX_HTML_BYTES = 2 * 1024 * 1024;

async function fetchHtml(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": "SaudeSlimFormBot/1.0 (+https://saudeslim.com.br)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`O site respondeu ${res.status}.`);
    const type = res.headers.get("content-type") ?? "";
    if (type && !type.includes("html")) throw new Error("O endereço não retornou uma página HTML.");
    const text = await res.text();
    return text.slice(0, MAX_HTML_BYTES);
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("O site demorou demais para responder.");
    throw new Error(e?.message ?? "Não foi possível ler o site.");
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function attr(tag: string, name: string): string | null {
  const m =
    tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i")) ??
    tag.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, "i")) ??
    tag.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, "i"));
  return m ? decodeEntities(m[1]).trim() : null;
}

function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

const IGNORED_TYPES = new Set(["hidden", "submit", "button", "reset", "image", "search"]);
const IGNORED_NAMES = /(csrf|token|nonce|honeypot|captcha|_wp|utm_|gclid|fbclid|action$|^s$)/i;

function guessKind(name: string, type: string, label: string): DetectedField["kind"] {
  const hay = `${name} ${label}`.toLowerCase();
  if (type === "email" || /e-?mail/.test(hay)) return "email";
  if (type === "tel" || /(telefone|whats|phone|celular|fone|contato)/.test(hay)) return "phone";
  if (type === "file") return "file";
  if (type === "number" || /(orcamento|orçamento|valor|budget|investimento)/.test(hay)) return "value";
  return "text";
}

function labelsByFor(html: string): Record<string, string> {
  const map: Record<string, string> = {};
  const re = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const target = attr(`<label ${m[1]}>`, "for");
    const text = textOf(m[2]);
    if (target && text) map[target] = text;
  }
  return map;
}

function parseForm(
  inner: string,
  openTag: string,
  index: number,
  labels: Record<string, string>,
  pageUrl: string,
): DetectedForm | null {

  const fields: DetectedField[] = [];
  const seen = new Set<string>();

  const push = (f: DetectedField) => {
    const key = f.name.toLowerCase();
    if (!f.name || seen.has(key)) return;
    if (IGNORED_NAMES.test(f.name)) return;
    seen.add(key);
    fields.push(f);
  };

  // inputs
  const inputRe = /<input\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(inner))) {
    const tag = m[0];
    const type = (attr(tag, "type") ?? "text").toLowerCase();
    if (IGNORED_TYPES.has(type)) continue;
    const name = attr(tag, "name") ?? attr(tag, "id") ?? "";
    const id = attr(tag, "id") ?? "";
    const label =
      labels[id] ||
      attr(tag, "aria-label") ||
      attr(tag, "placeholder") ||
      name.replace(/[_-]+/g, " ");
    if (type === "checkbox" || type === "radio") {
      push({ name, label: label || name, kind: "custom", required: /\brequired\b/i.test(tag) });
      continue;
    }
    push({
      name,
      label: label || name,
      kind: guessKind(name, type, label ?? ""),
      required: /\brequired\b/i.test(tag),
    });
  }

  // textareas
  const taRe = /<textarea\b([^>]*)>/gi;
  while ((m = taRe.exec(inner))) {
    const tag = `<textarea ${m[1]}>`;
    const name = attr(tag, "name") ?? attr(tag, "id") ?? "";
    const id = attr(tag, "id") ?? "";
    const label = labels[id] || attr(tag, "aria-label") || attr(tag, "placeholder") || name.replace(/[_-]+/g, " ");
    push({ name, label: label || name, kind: "text", required: /\brequired\b/i.test(tag) });
  }

  // selects
  const selRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  while ((m = selRe.exec(inner))) {
    const tag = `<select ${m[1]}>`;
    const name = attr(tag, "name") ?? attr(tag, "id") ?? "";
    const id = attr(tag, "id") ?? "";
    const label = labels[id] || attr(tag, "aria-label") || name.replace(/[_-]+/g, " ");
    const options: string[] = [];
    const optRe = /<option\b[^>]*>([\s\S]*?)<\/option>/gi;
    let o: RegExpExecArray | null;
    while ((o = optRe.exec(m[2]))) {
      const t = textOf(o[1]);
      if (t) options.push(t);
    }
    push({
      name,
      label: label || name,
      kind: "select",
      required: /\brequired\b/i.test(tag),
      options: options.slice(0, 40),
    });
  }

  if (fields.length === 0) return null;

  const nameGuess =
    attr(openTag, "aria-label") ||
    attr(openTag, "name") ||
    attr(openTag, "id") ||
    `Formulário ${index + 1}`;

  return {
    index,
    nome: nameGuess.replace(/[_-]+/g, " ").slice(0, 80),
    action: attr(openTag, "action"),
    method: (attr(openTag, "method") ?? "post").toLowerCase(),
    pageUrl,
    fields: fields.slice(0, 40),
  };
}

const PROVIDER_HINTS: Array<{ re: RegExp; label: string }> = [
  { re: /elementor-form/i, label: "Elementor (WordPress)" },
  { re: /wpcf7|contact-form-7/i, label: "Contact Form 7 (WordPress)" },
  { re: /wpforms/i, label: "WPForms (WordPress)" },
  { re: /hs-form|hsforms\.net/i, label: "HubSpot Forms" },
  { re: /rdstation|rd-station/i, label: "RD Station Forms" },
  { re: /typeform\.com/i, label: "Typeform (embed)" },
  { re: /docs\.google\.com\/forms/i, label: "Google Forms (embed)" },
  { re: /jotform/i, label: "Jotform (embed)" },
];

const EMBED_HINTS: Array<{ re: RegExp; label: string }> = [
  { re: /<iframe[^>]+typeform\.com/i, label: "Typeform" },
  { re: /<iframe[^>]+docs\.google\.com\/forms/i, label: "Google Forms" },
  { re: /<iframe[^>]+jotform/i, label: "Jotform" },
  { re: /<iframe[^>]+forms\.office\.com/i, label: "Microsoft Forms" },
  { re: /<iframe[^>]+tally\.so/i, label: "Tally" },
];

/** Páginas comuns onde formulários costumam morar (inclui criação de conta). */
const CANDIDATE_PATHS = [
  "/contato",
  "/contatos",
  "/fale-conosco",
  "/orcamento",
  "/orcamentos",
  "/cadastro",
  "/cadastre-se",
  "/criar-conta",
  "/inscricao",
  "/auth",
  "/signup",
  "/sign-up",
  "/register",
  "/registro",
  "/entrar",
  "/admin",
  "/assinar",
  "/comecar",
  "/teste-gratis",
  "/trial",
  "/contact",
  "/quero-saber-mais",
];

const LINK_KEYWORDS =
  /(contato|fale|orcament|orçament|cadastr|criar.?conta|inscri|demonstra|quero|comec|começ|trial|teste|lead|proposta|assinar|entrar|login|auth|conta|contact|signup|sign-up|register)/i;

/** Página de criação de conta / login (o cadastro também é um formulário). */
const AUTH_PAGE = /(auth|login|signin|sign-in|signup|sign-up|entrar|cadastr|criar-conta|registr|conta)/i;

function parsePageForms(html: string, pageUrl: string, startIndex: number): DetectedForm[] {
  const labels = labelsByFor(html);
  const out: DetectedForm[] = [];
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let m: RegExpExecArray | null;
  let i = startIndex;
  while ((m = formRe.exec(html)) && out.length < 12) {
    const parsed = parseForm(m[2], `<form ${m[1]}>`, i, labels, pageUrl);
    if (parsed) {
      out.push(parsed);
      i++;
    }
  }

  // Campos soltos: muitos sites modernos não usam a tag <form>.
  const withoutForms = html.replace(formRe, " ");
  const orphan = parseForm(withoutForms, "<form>", i, labels, pageUrl);
  if (orphan && orphan.fields.length >= 2 && out.length < 12) {
    out.push({
      ...orphan,
      nome: pageTitleGuess(html) ?? "Campos da página",
      inferred: true,
      note: "Campos identificados fora da tag <form>.",
    });
  }
  return out;
}

function pageTitleGuess(html: string): string | null {
  const t = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const text = t ? textOf(t).slice(0, 80) : "";
  return text || null;
}

const MAX_SCRIPT_BYTES = 900 * 1024;

async function fetchText(url: string, limit: number): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": "SaudeSlimFormBot/1.0 (+https://saudeslim.com.br)" },
    });
    if (!res.ok) return "";
    return (await res.text()).slice(0, limit);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

const SKIP_PLACEHOLDER = /(buscar|pesquis|search|cupom|filtr|selecione uma|ex\.:? *r\$)/i;
const PASSWORD_LABEL = /(senha|password|confirmar senha)/i;

function slugName(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/**
 * Sites feitos em React/Next/Vue não trazem o formulário no HTML: os campos
 * (inclusive a tela de criar conta) só existem depois que o JavaScript roda.
 * Aqui lemos os pacotes JS da própria página para identificar esses campos.
 */
async function inferFormsFromScripts(
  html: string,
  pageUrl: string,
  index: number,
): Promise<DetectedForm | null> {
  const origin = new URL(pageUrl).origin;
  const srcs = new Set<string>();
  const re = /(?:<script[^>]+src|<link[^>]+href)\s*=\s*["']([^"']+\.m?js[^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && srcs.size < 40) {
    try {
      const abs = new URL(m[1], pageUrl);
      if (abs.origin === origin) srcs.add(abs.toString());
    } catch {
      /* ignora url inválida */
    }
  }
  const all = [...srcs];
  const relevant = all.filter((u) =>
    /(auth|login|signup|sign-up|cadastr|registr|conta|form|contato|contact|lead)/i.test(u),
  );
  const isAuthPage = AUTH_PAGE.test(new URL(pageUrl).pathname);
  const chunks = (relevant.length > 0 ? relevant : isAuthPage ? all : []).slice(0, 5);
  if (chunks.length === 0) return null;

  const texts = await Promise.all(chunks.map((u) => fetchText(u, MAX_SCRIPT_BYTES)));
  const source = texts.join("\n");
  if (!source) return null;

  const fields: DetectedField[] = [];
  const seen = new Set<string>();
  const phRe = /placeholder\s*[:=]\s*(?:"([^"]{2,60})"|'([^']{2,60})'|`([^`]{2,60})`)/g;
  let p: RegExpExecArray | null;
  while ((p = phRe.exec(source)) && fields.length < 20) {
    const label = (p[1] ?? p[2] ?? p[3] ?? "").trim();
    if (!label || SKIP_PLACEHOLDER.test(label)) continue;
    // Senha não vira campo de lead no CRM.
    if (PASSWORD_LABEL.test(label)) continue;
    const name = slugName(label);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    fields.push({ name, label: label.slice(0, 80), kind: guessKind(name, "text", label), required: false });
  }

  const hasContact = fields.some((f) => f.kind === "email" || f.kind === "phone");
  if (!hasContact) return null;

  const title = pageTitleGuess(html);
  const nome = isAuthPage
    ? `Cadastro do site${title ? ` · ${title}` : ""}`.slice(0, 80)
    : (title ?? "Formulário do site").slice(0, 80);

  return {
    index,
    nome,
    action: null,
    method: "post",
    pageUrl,
    fields,
    inferred: true,
    note: isAuthPage
      ? "Página de criação de conta (site em JavaScript): campos lidos do próprio site."
      : "Site em JavaScript: campos lidos do pacote da página.",
  };
}


/** Links internos da página que provavelmente levam a um formulário. */
function internalCandidates(html: string, base: string): string[] {
  const origin = new URL(base).origin;
  const found = new Set<string>();
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && found.size < 20) {
    const href = m[1];
    const text = textOf(m[2]);
    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      continue;
    }
    if (abs.origin !== origin) continue;
    if (/\.(png|jpe?g|svg|webp|pdf|zip|css|js|ico|mp4)$/i.test(abs.pathname)) continue;
    if (!LINK_KEYWORDS.test(`${abs.pathname} ${text}`)) continue;
    abs.hash = "";
    found.add(abs.toString());
  }
  return [...found];
}

function looksLikeSpa(html: string): boolean {
  const hasRoot = /<div[^>]+id=["'](root|app|__next|__nuxt)["']/i.test(html);
  const hasModule = /<script[^>]+type=["']module["']/i.test(html);
  const bodyText = textOf(html.replace(/<script[\s\S]*?<\/script>/gi, ""));
  return (hasRoot || hasModule) && bodyText.length < 1500;
}

/**
 * Lê a página informada e, se não achar formulário, vasculha páginas internas
 * prováveis (contato, orçamento, cadastro…) antes de desistir.
 */
export async function scanSite(url: string): Promise<SiteScanResult> {
  const pages: ScannedPage[] = [];
  const embeds = new Set<string>();
  const hints = new Set<string>();
  const forms: DetectedForm[] = [];

  const html = await fetchHtml(url);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const spa = looksLikeSpa(html);

  const collect = async (pageHtml: string, pageUrl: string) => {
    PROVIDER_HINTS.forEach((h) => h.re.test(pageHtml) && hints.add(h.label));
    EMBED_HINTS.forEach((h) => h.re.test(pageHtml) && embeds.add(h.label));
    const found = parsePageForms(pageHtml, pageUrl, forms.length);
    if (found.length === 0) {
      // Nada no HTML: tenta deduzir os campos do JavaScript da página
      // (inclui a tela de criar conta de sites em React/Next).
      try {
        const inferred = await inferFormsFromScripts(pageHtml, pageUrl, forms.length);
        if (inferred) found.push(inferred);
      } catch {
        /* dedução é best-effort */
      }
    }
    forms.push(...found);
    pages.push({ url: pageUrl, ok: true, forms: found.length });
    return found.length;
  };

  await collect(html, url);

  if (forms.length === 0) {
    const origin = new URL(url).origin;
    const seenPath = new Set<string>([new URL(url).pathname.replace(/\/$/, "")]);
    const candidates = [
      ...internalCandidates(html, url),
      ...CANDIDATE_PATHS.map((p) => `${origin}${p}`),
    ]
      .filter((u) => {
        const path = new URL(u).pathname.replace(/\/$/, "");
        if (seenPath.has(path)) return false;
        seenPath.add(path);
        return true;
      })
      .sort((a, b) => Number(AUTH_PAGE.test(b)) - Number(AUTH_PAGE.test(a)))
      .slice(0, 8);

    for (const candidate of candidates) {
      if (forms.length >= 12) break;
      try {
        const sub = await fetchHtml(candidate);
        await collect(sub, candidate);
      } catch (e: any) {
        pages.push({ url: candidate, ok: false, forms: 0, note: e?.message ?? "não acessível" });
      }
      // Achou formulário numa página interna: não precisa varrer o resto.
      if (forms.length > 0) break;
    }
  }



  return {
    url,
    title: title ? textOf(title).slice(0, 120) : null,
    forms,
    hints: [...hints],
    pages,
    spa,
    embeds: [...embeds],
  };
}

