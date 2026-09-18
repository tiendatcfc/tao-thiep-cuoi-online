import { NextResponse } from "next/server";
import { prisma } from "@hpwd/db";
import { workerHeartbeatKey } from "@hpwd/worker";
import { pingRedis, readRedisKey } from "@/lib/rate-limit";
import { headBucket } from "@/lib/storage";

/**
 * `GET /api/health` — for an uptime monitor and for a container readiness
 * probe.
 *
 * Every check TOUCHES THE THING IT NAMES. A health endpoint that answers
 * `{"ok":true}` without talking to anything is worse than none: it reports
 * green throughout the outage it was installed to catch, and it is trusted
 * precisely because someone remembered to add it.
 *
 * Nothing about the failure is returned. The body says which component is
 * unhappy and no more — no connection strings, no driver messages, no
 * versions — because this endpoint is unauthenticated and a stack trace
 * here is a map of the infrastructure. The detail goes to the server log,
 * where the person who can act on it is already looking.
 */

/** Each probe is bounded: a wedged TCP connection must not hold the health check open. */
const CHECK_TIMEOUT_MS = 3_000;

type CheckState = "ok" | "fail" | "stale";

async function withTimeout(name: string, run: () => Promise<unknown>): Promise<CheckState> {
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${name} did not answer in ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS),
      ),
    ]);
    return "ok";
  } catch (error) {
    console.error(`[health] ${name} check failed:`, error);
    return "fail";
  }
}

/**
 * The worker writes a timestamp into Redis every 15s with a 60s expiry
 * (`apps/worker/src/heartbeat.ts`). A missing key means no worker has
 * written for at least a minute.
 *
 * This is the check that matters most and is easiest to leave out: when the
 * worker dies the web app stays perfectly healthy, and the only symptom is
 * uploads sitting at "Đang xử lý" forever, reported eventually by a couple
 * whose music never appeared.
 */
async function checkWorker(): Promise<CheckState> {
  try {
    const seenAt = await Promise.race([
      readRedisKey(workerHeartbeatKey()),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("redis did not answer")), CHECK_TIMEOUT_MS),
      ),
    ]);
    return seenAt ? "ok" : "stale";
  } catch (error) {
    console.error("[health] worker heartbeat check failed:", error);
    return "fail";
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const [database, redis, storage, worker] = await Promise.all([
    withTimeout("database", () => prisma.$queryRaw`SELECT 1`),
    withTimeout("redis", () => pingRedis()),
    withTimeout("storage", () => headBucket()),
    checkWorker(),
  ]);

  const checks = { database, redis, storage, worker };

  // The status code answers "can THIS instance serve requests?", which is
  // what a readiness probe restarts a container over — and a dead worker is
  // no reason to restart the web app. An uptime monitor wants the wider
  // question, so `?strict=1` folds the worker in too. Two consumers, two
  // needs, one endpoint.
  const strict = new URL(request.url).searchParams.get("strict") === "1";
  const serving = database === "ok" && redis === "ok" && storage === "ok";
  const healthy = serving && (!strict || worker === "ok");

  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks },
    {
      status: healthy ? 200 : 503,
      // A cached health check is not a health check.
      headers: { "cache-control": "no-store" },
    },
  );
}
