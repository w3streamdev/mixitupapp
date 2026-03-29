import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    root: "src",
    environment: "node",
    include: ["**/*.spec.ts", "**/*.test.ts"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/**/*.test.ts", "src/main.ts"],
    },
  },
});
