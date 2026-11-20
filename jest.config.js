/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: "app",
      preset: "jest-expo",
      testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts?(x)"],
    },
    {
      // Plain Node: jest-expo replaces fetch, and these tests talk HTTP to the E2E mock backend (ADR-016).
      displayName: "mock-backend",
      testEnvironment: "node",
      transform: {
        "\\.ts$": ["babel-jest", { presets: ["babel-preset-expo"] }],
      },
      testMatch: ["<rootDir>/e2e/mock-backend/__tests__/**/*.test.ts"],
    },
    {
      // Edge Function logic (handler.ts files); the Deno entry points are tested in CI (#21).
      displayName: "functions",
      testEnvironment: "node",
      transform: {
        "\\.ts$": ["babel-jest", { presets: ["babel-preset-expo"] }],
      },
      testMatch: ["<rootDir>/supabase/functions/**/__tests__/**/*.test.ts"],
    },
  ],
  collectCoverageFrom: [
    "src/domain/**/*.ts",
    "src/schemas/**/*.ts",
    "!**/__tests__/**",
  ],
};
