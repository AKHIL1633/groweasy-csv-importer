import globals from "globals";
import { baseConfig } from "../../eslint.config.base.mjs";

export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
];
