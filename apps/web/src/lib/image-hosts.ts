/**
 * The only hosts anything in this app is ever allowed to have the SERVER
 * fetch a user-supplied "cover image"/album image URL from — local dev
 * MinIO, and whatever `R2_PUBLIC_URL` actually is in this environment
 * (derived at call time so prod doesn't need a code change to swap
 * buckets/domains).
 *
 * Shared by `next.config.ts` (which needs this shape for `images.
 * remotePatterns`, restricting `/_next/image?url=` from becoming an open
 * SSRF proxy for any https URL on the internet) and
 * `app/i/[slug]/opengraph-image.tsx` (which fetches a cover image directly,
 * server-side, to inline into the OG PNG — Task 17 added that second
 * fetcher without applying the same allowlist `next.config.ts` already
 * established, letting an authenticated user park an internal/link-local
 * URL, e.g. `http://169.254.169.254/...`, as their cover image and have the
 * production server fetch it on every request for that invitation's OG
 * image). One list, so the two enforcement points can never drift apart.
 */
export interface AllowedImageHost {
  protocol: "http" | "https";
  hostname: string;
  port?: string;
}

/** Local dev MinIO container (see `apps/web/src/lib/storage.ts`). */
const LOCAL_DEV_HOST: AllowedImageHost = { protocol: "http", hostname: "localhost", port: "9000" };

export function getAllowedImageHosts(env: NodeJS.ProcessEnv = process.env): AllowedImageHost[] {
  const hosts: AllowedImageHost[] = [LOCAL_DEV_HOST];
  if (!env.R2_PUBLIC_URL) return hosts;

  try {
    const r2PublicUrl = new URL(env.R2_PUBLIC_URL);
    if (r2PublicUrl.protocol !== "http:" && r2PublicUrl.protocol !== "https:") return hosts;
    hosts.push({
      protocol: r2PublicUrl.protocol === "https:" ? "https" : "http",
      hostname: r2PublicUrl.hostname,
      ...(r2PublicUrl.port ? { port: r2PublicUrl.port } : {}),
    });
    return hosts;
  } catch {
    // Malformed R2_PUBLIC_URL — fall back to just the local-dev host rather
    // than throwing at config/request time.
    return hosts;
  }
}

/**
 * Whether `value` is an absolute `http`/`https` URL pointing at one of
 * `getAllowedImageHosts()` — the same check `next.config.ts`'s
 * `remotePatterns` enforces for `/_next/image?url=`, reusable anywhere else
 * that's about to make a server-side request to a user-supplied image URL.
 */
export function isAllowedImageUrl(value: string, env: NodeJS.ProcessEnv = process.env): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const protocol = url.protocol === "https:" ? "https" : "http";
  const port = url.port ?? "";
  return getAllowedImageHosts(env).some(
    (host) => host.protocol === protocol && host.hostname === url.hostname && (host.port ?? "") === port,
  );
}
