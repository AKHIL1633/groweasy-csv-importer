// Shared ESLint baseline, composed into every workspace's own eslint.config.mjs.
// Kept in one place so "no any", unused-vars handling, etc. can't drift between
// apps/api, apps/web, and packages/shared. See docs/09-coding-guidelines.md.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export const baseConfig = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.next/**", "**/coverage/**"],
  },
);

export default baseConfig;
