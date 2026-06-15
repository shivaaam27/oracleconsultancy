import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Dummy values so server modules that construct the Supabase client at import
    // (src/db/supabase.ts) don't throw. Tests never connect — they only call the
    // pure functions in these modules.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
    },
  },
  resolve: {
    // Mirror the tsconfig "@/*" → "src/*" path alias.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
