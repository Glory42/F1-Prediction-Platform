import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: "https://f1.gorkemkaryol.dev",
  output: "server",
  adapter: cloudflare({
    imageService: "passthrough",
  }),
  integrations: [react(), sitemap({
    // The data-quality dashboard is dev-only tooling (404-guarded in production);
    // keep it out of the public sitemap for live users.
    filter: (page) => !page.includes('/health-quality/'),
  })],
  vite: {
    optimizeDeps: {
      include: ["react", "react-dom", "react/jsx-runtime"],
    },

    server: {
      fs: {
        // Allow loading files from the monorepo root (e.g. docs/ for content collections)
        allow: ["../.."],
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  },
});
