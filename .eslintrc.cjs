module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  env: { browser: true, es2021: true, node: true },
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  ignorePatterns: ["dist", "node_modules"],
  rules: {
    // Tuning values must live in config data, not literals (mechanics spec preamble).
    // This is a reminder rule, not fully enforceable by ESLint alone — the real
    // enforcement is PR review against CODEOWNERS + the PR template checklist.
    "no-magic-numbers": "off"
  }
};
