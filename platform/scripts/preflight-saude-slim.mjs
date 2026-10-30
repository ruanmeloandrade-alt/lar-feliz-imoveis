#!/usr/bin/env node
/**
 * Saúde Slim: pré-compilação estática sem pacotes externos.
 * Rode com Node >=22 antes de npm install/build.
 * NÃO executa GitHub Actions nem precisa de acesso a projetos legados.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const has = (file) => fs.existsSync(path.join(root, file));

const required = [
  "package.json", "vite.config.ts", "src/start.ts", "src/routeTree.gen.ts",
  "src/routes/__root.tsx", "src/routes/auth.tsx", "src/routes/saude-slim.tsx",
  "src/routes/pedidos.tsx", "src/routes/crm.leads.tsx",
  "src/routes/crm.produtos.tsx", "src/routes/crm.estoque.tsx",
  "src/lib/saude-slim-sales-client.ts", "src/lib/saude-slim-orders-client.ts",
  "src/lib/saude-slim-products-client.ts", "src/lib/saude-slim-leads-client.ts",
  "src/lib/saude-slim-funnel-client.ts",
  "src/integrations/supabase/saude-slim-env.ts",
];
for (const file of required) if (!has(file)) errors.push("Arquivo obrigatório ausente: " + file);
if (errors.length) {
  console.error("[Saúde Slim] Arquivos necessários para o preflight não encontrados:");
  for (const err of errors) console.error("ERRO: " + err);
  process.exit(1);
}

const packageJson = JSON.parse(read("package.json"));
const engines = packageJson.engines?.node ?? "";
if (!packageJson.scripts?.build || !packageJson.scripts?.["check:routes"])
  errors.push("package.json precisa de build e check:routes");
if (!/^>=22/.test(engines)) warnings.push("Conferir engines.node: " + engines);
const versionParts = (version) => String(version || "").replace(/^[^\d]*/, "").split(".").map(Number);
const atLeast = (version, major, minor, patch) => {
  const [m, n, p] = versionParts(version);
  return Number.isFinite(m) && (
    m > major || (m === major && (n > minor || (n === minor && p >= patch)))
  );
};
if (!atLeast(packageJson.dependencies?.["@tanstack/react-start"], 1, 168, 60))
  errors.push("TanStack React Start abaixo de 1.168.60: CVE-2026-102989.");
if (!atLeast(packageJson.dependencies?.["@tanstack/start-server-core"], 1, 169, 39))
  errors.push("TanStack server-core abaixo de 1.169.39: CVE-2026-102989.");
if (has("bun.lock"))
  errors.push("Lockfile Bun legado ainda presente: remova e gere npm package-lock com dependências corrigidas.");
if (process.versions.node.split(".").map(Number)[0] < 22) errors.push("Node >=22 é obrigatório.");

const gen = read("src/routeTree.gen.ts");
const routeImports = [...gen.matchAll(/from ['"]\.\/routes\/([^'"]+)['"]/g)].map((m) => m[1]);
const ext = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".json", ".css", ".svg"];
for (const name of new Set(routeImports)) {
  if (!ext.some((suffix) => has("src/routes/" + name + suffix)))
    errors.push("Rota do routeTree sem arquivo: " + name);
}

const localSources = [
  "src/routes/saude-slim.tsx",
  "src/routes/pedidos.tsx",
  "src/routes/crm.leads.tsx",
  "src/routes/crm.estoque.tsx",
  "src/legacy/crm.produtos.legacy.tsx",
  "src/legacy/crm.funis-de-venda.legacy.tsx",
  "src/lib/saude-slim-sales-client.ts",
  "src/lib/saude-slim-orders-client.ts",
  "src/lib/saude-slim-products-client.ts",
  "src/lib/saude-slim-leads-client.ts",
  "src/lib/saude-slim-funnel-client.ts",
  "src/lib/saude-slim-permissions-client.ts",
  "src/lib/saude-slim-dedupe-client.ts",
  "src/hooks/use-permissions.ts",
  "src/hooks/use-roles.ts",
];
const resolutionExt = ["", ...ext, "/index.ts", "/index.tsx", "/index.js"];
for (const file of localSources) {
  if (!has(file)) {
    errors.push("Fonte operacional ausente: " + file);
    continue;
  }
  const code = read(file);
  const deps = [...code.matchAll(/\b(?:from|import)\s*(?:\(\s*)?['"]([^'"]+)['"]/g)].map((m) => m[1]);
  for (const dep of deps) {
    if (!dep.startsWith("@/") && !dep.startsWith(".")) continue;
    const ref = dep.split("?")[0].split("#")[0];
    const absolute = ref.startsWith("@/")
      ? path.join(root, "src", ref.slice(2))
      : path.resolve(root, path.dirname(file), ref);
    if (!resolutionExt.some((suffix) => fs.existsSync(absolute + suffix)))
      errors.push("Import local ausente: " + file + " -> " + dep);
  }
}


if (has("index.html")) {
  warnings.push("Há um index.html na raiz; conferir se é o app completo e não a landing temporária.");
}
if (has("src/legacy/crm.funis-de-venda.legacy.tsx") &&
  read("src/legacy/crm.funis-de-venda.legacy.tsx").includes("useServerFn("))
  warnings.push("Funil Kanban possui chamadas createServerFn residuais: backend ainda precisa de migração.");

finish();

function finish() {
  console.log("[Saúde Slim] Pré-validação Node sem dependências");
  console.log("Rotas referenciadas: " + (typeof routeImports === "undefined" ? 0 : routeImports.length));
  for (const msg of warnings) console.warn("ATENÇÃO: " + msg);
  for (const msg of errors) console.error("ERRO: " + msg);
  if (errors.length) {
    console.error("Resultado: FALHOU (" + errors.length + " problema(s))");
    process.exitCode = 1;
  } else {
    console.log("Resultado: pré-validação estática PASSOU. Build npm e E2E ainda são obrigatórios.");
  }
}
