import tseslint from "typescript-eslint";

/**
 * See packages/db/eslint.config.mjs for why these two packages had no lint
 * at all until now. This one is the smallest of the four and also the one
 * every other package imports: `invitation.ts` is the zod schema that
 * decides whether a couple's document still parses, and an editor change
 * that makes it stop parsing is the failure mode that silently halts
 * autosave for a whole invitation.
 */
export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // The tests here exist to judge documents the COMPILE-TIME types
    // forbid: a section with an invented `type`, a `customFonts` entry
    // written by a release that predates `assetId`, an album image saved
    // before captions existed. Those are exactly the shapes that arrive
    // from the database at runtime, and the schema is the only thing that
    // can rule on them — a test that could only build a well-typed
    // document would be testing the type system instead.
    //
    // So `any` is the tool, not a shortcut, and it is confined to this
    // directory. `unknown` does not work: these tests reach into
    // `doc.theme.customFonts` and `doc.sections.find(...)`, which `unknown`
    // will not let them index.
    files: ["src/__tests__/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
