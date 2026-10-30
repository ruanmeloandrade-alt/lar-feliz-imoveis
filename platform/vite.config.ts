import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { applySalesbotBuilderTransform } from "./scripts/salesbot-save-feedback-transform";
import { applySalesbotFlowLineUxTransform } from "./scripts/salesbot-flow-line-ux-transform";

const salesbotSaveFeedbackPlugin = {
  name: "mkton-salesbot-save-feedback",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    const cleanId = id.replace(/\\/g, "/").split("?", 1)[0];
    if (cleanId?.endsWith("/src/components/automations/SalesbotBuilder.tsx")) {
      return {
        code: applySalesbotFlowLineUxTransform(applySalesbotBuilderTransform(code)),
        map: null,
      };
    }
    return null;
  },
};

// Saúde Slim é independente: não ativar plugin MCP de projeto herdado no build.

export default defineConfig({
  base: "/system-assets/",
  css: { postcss: { plugins: [] } },
  plugins: [
    salesbotSaveFeedbackPlugin,
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
      router: { basepath: "/", routeFileIgnorePattern: "(mcp|oauth-protected-resource|lovable)" },
    }),
    nitro({ preset: "node-server" }),
    viteReact(),
  ],
  ssr: { optimizeDeps: { include: ["@tanstack/react-start", "@tanstack/start-client-core"] } },
});
