#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const forbiddenRefs = new Set(["wqriaxzymngkntccljjp", "xmoiyffwmolwmjzeuqjf"]);
const envFiles = [".env", ".env.development", ".env.production"].map((file) => resolve(root, file));

function readEnv(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function parseEnv(source) {
  const out = new Map();
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    out.set(key.trim(), rest.join("=").trim().replace(/^['"]|['"]$/g, ""));
  }
  return out;
}

function projectRefFromUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const [projectRef] = url.hostname.split(".");
    if (!url.hostname.endsWith(".supabase.co") || !projectRef) return null;
    return projectRef;
  } catch {
    return null;
  }
}

const merged = new Map();
for (const file of envFiles) {
  for (const [key, value] of parseEnv(readEnv(file))) merged.set(key, value);
}

const refs = [
  merged.get("SUPABASE_PROJECT_ID"),
  merged.get("VITE_SUPABASE_PROJECT_ID"),
  projectRefFromUrl(merged.get("SUPABASE_URL") ?? ""),
  projectRefFromUrl(merged.get("VITE_SUPABASE_URL") ?? ""),
].filter(Boolean);

const inherited = refs.filter((ref) => forbiddenRefs.has(ref));
if (inherited.length > 0) {
  console.error(`[Saude Slim audit] inherited Supabase project ref detected: ${[...new Set(inherited)].join(", ")}`);
  process.exit(1);
}

const required = ["SUPABASE_PROJECT_ID", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PROJECT_ID", "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];
const missing = required.filter((key) => !merged.get(key));
if (missing.length > 0) {
  console.error(`[Saude Slim audit] missing required env key(s): ${missing.join(", ")}`);
  process.exit(1);
}

console.log("[Saude Slim audit] Supabase env does not point to known inherited project refs.");
