import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    // The build config is read by Node during `next build`, not shipped to the
    // browser, so it gets Node's globals rather than the browser's.
    files: ["next.config.js"],
    languageOptions: {
      globals: { process: "readonly" },
    },
  },
];
