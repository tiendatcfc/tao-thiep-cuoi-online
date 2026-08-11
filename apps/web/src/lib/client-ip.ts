/**
 * IP used as the rate-limit bucket key. In production this sits behind
 * Cloudflare, which sets `x-forwarded-for` to the real client IP (first
 * entry in the list — later entries are intermediate proxies); `x-real-ip`
 * and `'unknown'` are fallbacks for local/dev requests that carry neither.
 *
 * Shared by every public route that rate-limits per IP (wishes, form
 * submissions, ...) so the resolution logic — and its production
 * assumptions about which header to trust — lives in exactly one place.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}
