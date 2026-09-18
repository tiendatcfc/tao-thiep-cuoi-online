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
  vi.unstubAllGlobals();
  delete process.env.REMBG_URL;
});

describe("GET /api/health", () => {
  it("reports every component when all of them answer", async () => {
    stubAllHealthy();

    const response = await GET(healthRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      checks: { database: "ok", redis: "ok", storage: "ok", worker: "ok", backgroundRemoval: "off" },
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

// `services/rembg` is a real service in docker-compose.prod.yml, and it is
// the one component nothing was watching: it is reached only from the
// worker, so when its container dies every other check stays green and the
// only symptom is "Xoá nền" failing for whoever presses it.
describe("GET /api/health — the background-removal service", () => {
  it("reports it off, and stays healthy, when REMBG_URL is not configured", async () => {
    stubAllHealthy();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(healthRequest("?strict=1"));
    const body = (await response.json()) as { checks: Record<string, string> };

    expect(body.checks.backgroundRemoval).toBe("off");
    expect(response.status).toBe(200);
    // A deployment that does not run rembg must not be probed at all —
    // otherwise it goes red forever and the monitor gets muted.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("probes its /health endpoint when REMBG_URL is configured", async () => {
    stubAllHealthy();
    process.env.REMBG_URL = "http://rembg:7000";
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(healthRequest());
    const body = (await response.json()) as { checks: Record<string, string> };

    expect(body.checks.backgroundRemoval).toBe("ok");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://rembg:7000/health");
  });

  it("does not care how REMBG_URL is punctuated", async () => {
    stubAllHealthy();
    process.env.REMBG_URL = "http://rembg:7000/";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await GET(healthRequest());

    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://rembg:7000/health");
  });

  it.each([
    ["it answers 503", async () => new Response("", { status: 503 })],
    ["the connection is refused", async () => { throw new Error("ECONNREFUSED"); }],
  ])("marks it failed when %s", async (_label, respond) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubAllHealthy();
    process.env.REMBG_URL = "http://rembg:7000";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(respond));

    const response = await GET(healthRequest());
    const body = (await response.json()) as { checks: Record<string, string> };

    expect(body.checks.backgroundRemoval).toBe("fail");
    // Same reasoning as the worker: "Xoá nền" is one optional button, so a
    // dead rembg is not a reason for the orchestrator to restart the web
    // container. The uptime monitor still wants to hear about it.
    expect(response.status).toBe(200);
  });

  it("fails the check under ?strict=1 when it is configured but down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubAllHealthy();
    process.env.REMBG_URL = "http://rembg:7000";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    expect((await GET(healthRequest("?strict=1"))).status).toBe(503);
  });

  it("leaks nothing about where the service lives", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubAllHealthy();
    process.env.REMBG_URL = "http://rembg-internal.vpc.local:7000";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 10.0.3.14:7000")));

    const body = await (await GET(healthRequest())).text();

    expect(body).not.toContain("rembg-internal");
    expect(body).not.toContain("10.0.3.14");
  });
});
