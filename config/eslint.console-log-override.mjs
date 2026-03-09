import baseConfig from "../renderer/eslint.config.mjs";

export default [
  ...baseConfig,
  {
    rules: {
      "no-console": ["error", { allow: ["warn", "error", "log"] }],
    },
  },
];
