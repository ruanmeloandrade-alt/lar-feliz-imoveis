import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const base = process.env.VITE_BASE_PATH || "/";

export default defineConfig({
  base,
  plugins: [react()],
});
