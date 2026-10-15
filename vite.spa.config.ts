/**
 * Static SPA build for Capacitor / static hosting.
 * Same plugins as vite.config.ts, but TanStack Start runs in SPA mode and
 * no Nitro server, so the output is index.html + assets only
 * (no server functions, no DB migration, no auth server).
 */
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart({
      spa: { enabled: true, prerender: { outputPath: "/index.html", crawlLinks: false } },
    }),
    viteReact(),
  ],
});
