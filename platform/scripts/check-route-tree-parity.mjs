import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const routeTreePath = path.join(root, "src", "routeTree.gen.ts");
const routeTree = fs.readFileSync(routeTreePath, "utf8");

const imports = [...routeTree.matchAll(/from ['"]\.\/routes\/([^'"]+)['"]/g)].map(
  (match) => match[1],
);

const extensions = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];
const missing = [];

for (const importedPath of new Set(imports)) {
  const sourceBase = path.join(root, "src", "routes", importedPath);
  const exists = extensions.some((extension) => fs.existsSync(`${sourceBase}${extension}`));
  if (!exists) missing.push(importedPath);
}

if (missing.length > 0) {
  console.error("\n[route-tree-parity] Generated route tree references missing source routes:");
  for (const route of missing) console.error(`  - src/routes/${route}.{ts,tsx,js,jsx,mts,mjs}`);
  console.error(
    "\nRegenerate/reconcile src/routeTree.gen.ts or provide an explicit inert tombstone before build/publish.\n",
  );
  process.exit(1);
}

console.log(`[route-tree-parity] OK: ${new Set(imports).size} generated route imports have source files.`);
