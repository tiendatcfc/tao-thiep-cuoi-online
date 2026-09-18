import { prisma } from "@hpwd/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";
import * as rateLimit from "@/lib/rate-limit";
import * as storage from "@/lib/storage";

function healthRequest(query = ""): Request {
  return new Request(`http://localhost:3000/api/health${query}`);
}

function stubAllHealthy() {
  vi.spyOn(prisma, "$queryRaw").mockResolvedValue([{ "?column?": 1 }] as never);
  vi.spyOn(rateLimit, "pingRedis").mockResolvedValue(undefined);
  vi.spyOn(storage, "headBucket").mockResolvedValue(undefined);
  vi.spyOn(rateLimit, "readRedisKey").mockResolvedValue("2026-09-18T05:00:00.000Z");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("reports every component when all of them answer", async () => {
    stubAllHealthy();

    const response = await GET(healthRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      checks: { database: "ok", redis: "ok", storage: "ok", worker: "ok" },
    });
  });

  // A health endpoint that returns {"ok":true} without touching anything is
  // worse than none: it reports green through the outage it exists to catch.
  it.each([
    ["database", () => vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("db down"))],
    ["redis", () => vi.spyOn(rateLimit, "pingRedis").mockRejectedValue(new Error("redis down"))],
    ["storage", () => vi.spyOn(storage, "headBucket").mockRejectedValue(new Error("bucket gone"))],
  ])("returns 503 and names %s when it fails", async (name, breakIt) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubAllHealthy();
    breakIt();

    const response = await GET(healthRequest());
    const body = (await response.json()) as { status: string; checks: Record<string, string> };

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks[name]).toBe("fail");
  });

  // Nothing here is authenticated, so a driver message or a connection
  // string in the body is a free map of the infrastructure.
  it("leaks no detail about the failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubAllHealthy();
    vi.spyOn(prisma, "$queryRaw").mockRejectedValue(
      new Error("Can't reach database server at postgres-prod.internal:5432 (user: hpwd_admin)"),
    );

    const body = await (await GET(healthRequest())).text();

    expect(body).not.toContain("postgres-prod.internal");
    expect(body).not.toContain("hpwd_admin");
    expect(body).not.toContain("5432");
  });

  // A missing heartbeat key means no worker has written for at least a
  // minute. The web app can still serve every page, so a readiness probe
  // must not restart it over this — but an uptime monitor does want to know,
  // because a dead worker is otherwise completely silent.
  it("calls the worker stale but keeps serving when the heartbeat is gone", async () => {
    stubAllHealthy();
    vi.spyOn(rateLimit, "readRedisKey").mockResolvedValue(null);

    const response = await GET(healthRequest());
    const body = (await response.json()) as { checks: Record<string, string> };

    expect(response.status).toBe(200);
    expect(body.checks.worker).toBe("stale");
  });

  it("fails the check under ?strict=1 when the worker is stale", async () => {
    stubAllHealthy();
    vi.spyOn(rateLimit, "readRedisKey").mockResolvedValue(null);

    const response = await GET(healthRequest("?strict=1"));

    expect(response.status).toBe(503);
  });

  it("is never cached", async () => {
    stubAllHealthy();

    expect((await GET(healthRequest())).headers.get("cache-control")).toBe("no-store");
  });
});
