import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "playwright-report/**", "test-results/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Shared context modules intentionally export hooks alongside providers/components.
      "react-refresh/only-export-components": "off",
      // App-styled ConfirmDialog/Dialog and Toast only; no browser-native dialogs or notifications
      // (UI_COLOR_CONFIRMATION_DESIGN D-N3). `beforeunload` stays browser-owned (§2.7).
      "no-alert": "error",
      "no-restricted-globals": [
        "error",
        { name: "Notification", message: "Use Toast (UI_COLOR_CONFIRMATION_DESIGN D-N3)." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "Notification", message: "Use Toast (UI_COLOR_CONFIRMATION_DESIGN D-N3)." },
        { object: "globalThis", property: "Notification", message: "Use Toast (UI_COLOR_CONFIRMATION_DESIGN D-N3)." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: "Render untrusted text as React text nodes; do not use dangerouslySetInnerHTML.",
        },
      ],
    },
  },
  {
    files: ["**/*.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
);
