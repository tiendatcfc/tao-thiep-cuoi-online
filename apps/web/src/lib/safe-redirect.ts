const DEFAULT_NEXT_PATH = "/dashboard";

/**
 * Validates a `?next=` query param (e.g. `/dang-nhap?next=/mau-thiep`) into
 * a safe in-app path to send the user to after signing in. Only ever
 * returns a same-origin relative path — never the raw input — so a crafted
 * link can't be used as an open redirect to an external site
 * (`https://evil.example.com`, the protocol-relative `//evil.example.com`,
 * or a `javascript:` URL all fall back to the default instead of being
 * honored).
 */
export function sanitizeNextPath(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return DEFAULT_NEXT_PATH;
  // A single leading "/" not followed by another "/" rules out both
  // protocol-relative URLs ("//host/...") and absolute URLs (which don't
  // start with "/" at all) in one check.
  if (!value.startsWith("/") || value.startsWith("//")) return DEFAULT_NEXT_PATH;
  return value;
}
