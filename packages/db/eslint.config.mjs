import tseslint from "typescript-eslint";

/**
 * `turbo lint` ran 2 of 4 packages for the whole project's life: apps/web
 * and apps/worker had a `lint` script, this one and @hpwd/schema did not,
 * so turbo reported success while checking nothing here. What went
 * unchecked is not boilerplate — `scripts/backup.ts` and
 * `scripts/restore.ts` are the disaster-recovery path, and
 * `scripts/backup-lib.ts` holds the guard that refuses to write backups
 * into the public media bucket.
 *
 * `typescript-eslint` rather than `eslint-config-next`, for the same reason
 * apps/worker uses it: no React, no JSX, no Next runtime, so the Next
 * preset would only report rules that cannot apply.
 */
export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**", "prisma/generated/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // Unused args prefixed `_` are the established convention across this
      // repository (see the route handlers' `_request`).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
