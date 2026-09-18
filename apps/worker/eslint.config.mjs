import tseslint from "typescript-eslint";

/**
 * This package went three tasks without a `lint` script, so `turbo lint`
 * silently covered only `apps/web` — every line of the ffmpeg wrapper, the
 * S3 helpers and both job processors was unchecked, which is the wrong half
 * of the repository to leave unchecked: it is the half that runs untrusted
 * uploads through a subprocess and an HTTP call.
 *
 * `typescript-eslint` rather than `eslint-config-next` (what apps/web uses):
 * there is no React, no JSX and no Next runtime here, so the Next preset
 * would apply rules about hooks and `<img>` to a background worker and
 * report nothing useful.
 */
export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // The codebase deliberately casts through `unknown` when reading a
      // Prisma `Json` column, which has no compile-time shape.
      "@typescript-eslint/no-explicit-any": "error",
      // Unused args prefixed `_` are the established convention here (see
      // the route handlers' `_request`).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
