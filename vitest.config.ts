import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    include: [
      "tests/**/*.test.ts",
      "apps/**/tests/**/*.test.ts",
      "packages/**/tests/**/*.test.ts",
      "evals/**/*.test.ts",
    ],
  },
});
