import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

const unusedVarsRule = [
  "warn",
  { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/coverage/**",
      "apps/api/prisma/migrations/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": unusedVarsRule,
    },
  },
  // apps/api — Node.js (NestJS)
  {
    files: ["apps/api/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // NestJS DI полагается на пустые конструкторы/декораторы без явного использования параметров.
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
  // apps/web, apps/extension — React + браузер
  {
    files: ["apps/web/**/*.{ts,tsx}", "apps/extension/src/sidepanel/**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks, "react-refresh": reactRefresh },
    languageOptions: {
      globals: globals.browser,
    },
    settings: { react: { version: "18.3" } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  // apps/extension — фоновый service worker + общий код (chrome.* API)
  {
    files: ["apps/extension/src/**/*.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
  // packages/shared — переиспользуемая библиотека
  {
    files: ["packages/shared/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
);
