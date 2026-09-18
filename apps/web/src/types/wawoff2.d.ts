/**
 * `wawoff2` is a WASM build of Google's woff2 tool and ships no types, and
 * no `@types/wawoff2` exists on npm. Only `compress` is used here, so the
 * declaration stays deliberately narrow rather than pretending to describe
 * the whole module: a wrong guess about an API nothing calls would be worse
 * than no declaration at all.
 */
declare module "wawoff2" {
  /** TTF/OTF bytes in, WOFF2 bytes out. Rejects on anything it cannot convert, including input that is already WOFF2. */
  export function compress(input: Uint8Array): Promise<Uint8Array>;
  /** WOFF2 bytes in, TTF bytes out. Declared for completeness; unused. */
  export function decompress(input: Uint8Array): Promise<Uint8Array>;
}
