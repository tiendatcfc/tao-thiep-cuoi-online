/**
 * The IP used as a rate-limit bucket key, resolved from the request headers
 * according to how this deployment is actually fronted.
 *
 * THE POINT. `x-forwarded-for` is a list the CALLER may start and each
 * proxy APPENDS to. Anyone can send `X-Forwarded-For: 1.2.3.4`, so the
 * leftmost entry is attacker-chosen: reading it (which this file used to
 * do) puts every request in a different bucket and the rate limit stops
 * existing, silently, while every test that sends the header keeps passing.
 * Only entries appended by infrastructure we own can be believed, and those
 * are at the RIGHT-hand end — one per hop.
 *
 * There is no way to work this out at runtime: a Web `Request` carries no
 * peer address, so the deployment has to declare its own shape. See
 * `.env.example` and `docs/operations.md` for the three topologies.
 *
 * Shared by every public route that rate-limits per IP (wishes, form
 * submissions), so the assumption lives in exactly one place.
 */

const DEFAULT_TRUSTED_PROXY_HOPS = 1;

/** Grouping every unidentifiable caller together is the conservative answer: they share a bucket rather than each getting a free one. */
const UNKNOWN = "unknown";

/** Longest possible textual IPv6 address, e.g. an IPv4-mapped one. */
const MAX_IP_LENGTH = 45;

/**
 * Enough of an address check to keep the value fit for a Redis key — not a
 * full parser. Whatever is returned here is concatenated into
 * `wish:<ip>:<slug>`, so an unchecked value lets a caller push megabytes
 * into the keyspace or shape the key itself with a colon.
 */
function isPlausibleIp(value: string): boolean {
  if (!value || value.length > MAX_IP_LENGTH) return false;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    return value.split(".").every((octet) => Number(octet) <= 255);
  }

  // At least two colons rules out `1.2.3.4:5678` (an address with a port,
  // which some proxies emit and which would otherwise split the key) while
  // admitting every real IPv6 form, including `::ffff:203.0.113.9`.
  const colons = value.split(":").length - 1;
  return colons >= 2 && /^[0-9a-fA-F:.]+$/.test(value);
}

function normalize(value: string | null): string {
  const trimmed = value?.trim() ?? "";
  return isPlausibleIp(trimmed) ? trimmed : UNKNOWN;
}

/**
 * How many proxies of ours the request passes through. 0 means the app is
 * exposed directly and nothing forwarded may be trusted at all.
 */
function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS;
  if (raw === undefined || raw === "") return DEFAULT_TRUSTED_PROXY_HOPS;

  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0) {
    // Never throw: this runs inside the wish and RSVP handlers, and a typo
    // in an env var must not stop guests from replying to an invitation.
    console.error(
      `TRUSTED_PROXY_HOPS is "${raw}", which is not a whole number of hops; falling back to ${DEFAULT_TRUSTED_PROXY_HOPS}.`,
    );
    return DEFAULT_TRUSTED_PROXY_HOPS;
  }
  return hops;
}

export function getClientIp(request: Request): string {
  // A CDN-specific header (Cloudflare's `cf-connecting-ip`) is better than
  // any amount of list arithmetic, because the CDN OVERWRITES it on every
  // request instead of appending — the caller cannot extend it. When one is
  // configured it is the only thing consulted: falling back to
  // `x-forwarded-for` would hand an attacker who reaches the origin
  // directly a way to opt out of the stronger header.
  const headerName = process.env.CLIENT_IP_HEADER?.trim();
  if (headerName) return normalize(request.headers.get(headerName));

  const hops = trustedProxyHops();
  if (hops < 1) return UNKNOWN;

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const entries = forwardedFor
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    // The last entry was appended by the proxy nearest to us, the one
    // before it by the proxy before that, and so on.
    const index = entries.length - hops;
    // A chain shorter than configured means the request did not come the
    // expected way — straight at the container, bypassing the CDN, for
    // instance. Every entry left is caller-written, so none may be used.
    if (index < 0) return UNKNOWN;
    return normalize(entries[index] ?? null);
  }

  // No list at all, but a proxy is trusted: nginx-style `x-real-ip` is then
  // its work, and it is a single value with no list to walk.
  return normalize(request.headers.get("x-real-ip"));
}
