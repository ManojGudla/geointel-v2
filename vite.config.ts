import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import apiPlugin from "./plugins/vite-plugin-api";
import prerenderPlugin from "./plugins/vite-plugin-prerender";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Vite's own env loading (.env, .env.local, .env.[mode].local - same
  // files/precedence Vite already documents) only exposes VITE_-prefixed
  // vars to client code via import.meta.env. The api/*.ts handlers are
  // server-side Node code reading process.env directly (OPENROUTER_API_KEY,
  // SUPABASE_URL, ...) - nothing was ever loading .env.local's contents
  // into process.env for them in dev, so a correctly filled-in .env.local
  // still produced "not configured" errors locally. loadEnv's third
  // argument ("") means "no prefix filter, load every key," and copying
  // that onto process.env here (before apiPlugin's handlers run) is what
  // makes local dev match production, where the hosting platform injects
  // these into process.env directly.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [react(), apiPlugin(), prerenderPlugin()],
    resolve: {
      alias: {
        "@": path.resolve(dirname, "src"),
      },
    },
    server: {
      // Only this computer by default. This was `host: true`, which opened
      // the dev server to everyone on the same Wi-Fi all the time, and Vite
      // 5's dev server has path-traversal advisories: on café or office
      // Wi-Fi, someone nearby could read project files such as .env.local.
      // To test on a phone, run `npm run dev:phone`: it binds to the LAN for
      // that session only, and Vite prints the "Network:" URL to open.
      host: "localhost",
      port: 5173,
      strictPort: true,
    },
    build: {
      /**
       * Source maps in development, not in the deployed site.
       *
       * This was `true`, which shipped a complete map of every source file to
       * the public internet - 3.7 MB for the main bundle alone, and enough to
       * reconstruct the entire codebase from the live URL. That is a lot to
       * give away for a debugging aid nobody was using in production.
       *
       * Lighthouse does flag "missing source maps for large first-party
       * JavaScript", and it flagged them while they were being shipped too:
       * it could not parse them ("Unexpected end of JSON input" on all four),
       * so they were costing the download and delivering nothing. The audit is
       * marked Unscored either way, so this changes the report's wording and
       * not its score.
       *
       * Flip to `true` locally when a production-shaped bug actually needs
       * tracing back to source.
       */
      sourcemap: mode !== "production",
    },
  };
});
