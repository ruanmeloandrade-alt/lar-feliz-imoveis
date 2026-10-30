#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const allowedFiles = new Set([
  "scripts/audit-saude-slim-backend-env.mjs",
  "scripts/audit-saude-slim-hardcoded-origins.mjs",
  "src/integrations/supabase/saude-slim-env.ts",
  "docs/runbooks/saude-slim-backend-independente.md",
  "docs/tasks/2026-10-12-saude-slim-backend-independente.md",
]);

const patterns = [
  "wqriaxzymngkntccljjp",
  "xmoiyffwmolwmjzeuqjf",
  "https://mkton.io",
  "project--47369245-434e-4f46-a9b5-ee1cec604309.lovable.app",
];

let output = "";
try {
  const patternArgs = patterns.flatMap((pattern) => ["-e", pattern]);
  output = execFileSync("rg", ["-n", ...patternArgs, "src", "services", "scripts", "supabase"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  if (error.status !== 1) throw error;
}

const risky = output
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((line) => {
    const file = line.split(":")[0]?.replace(/\\/g, "/");
    if (!file || allowedFiles.has(file)) return false;
    if (file.startsWith("supabase/qa/")) return false;
    if (file.startsWith("supabase/migrations/") && !file.includes("20261012")) return false;
    if (file.includes("/__tests__/")) return false;
    return true;
  });

if (risky.length > 0) {
  console.error("[Saude Slim audit] inherited hardcoded origin/ref detected:");
  for (const line of risky) console.error(line);
  process.exit(1);
}

console.log("[Saude Slim audit] no inherited hardcoded runtime origins detected in checked files.");
