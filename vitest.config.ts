import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    // No test may reach the internet (tests/setup/noNetwork.ts).
    setupFiles: ["tests/setup/noNetwork.ts"],
    // The same clock on every machine as in CI: a test that depends on the
    // computer's time zone fails here too, not only after a push.
    env: { TZ: "UTC" },
  },
});
