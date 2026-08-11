import { randomUUID } from "node:crypto";
import { prisma } from "@hpwd/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { GET } from "../music/route";

// ---------------------------------------------------------------------------
// Fixtures — real Postgres (docker `hpwd-postgres`), no Prisma mocking, same
// approach as wishes.test.ts. Every MusicTrack row a test creates is tracked
// and deleted in `afterEach`.
// ---------------------------------------------------------------------------

const createdTrackIds: string[] = [];

async function createTrack(overrides: {
  title?: string;
  artist?: string;
  url?: string;
  duration?: number;
  category?: string;
  isActive?: boolean;
} = {}) {
  const track = await prisma.musicTrack.create({
    data: {
      title: overrides.title ?? `Test Track ${randomUUID()}`,
      artist: overrides.artist ?? "Test Artist",
      url: overrides.url ?? "https://cdn.test/track.m4a",
      duration: overrides.duration ?? 30,
      category: overrides.category ?? "test",
      isActive: overrides.isActive ?? true,
    },
  });
  createdTrackIds.push(track.id);
  return track;
}

afterEach(async () => {
  if (createdTrackIds.length > 0) {
    await prisma.musicTrack.deleteMany({ where: { id: { in: createdTrackIds } } });
    createdTrackIds.length = 0;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/music", () => {
  it("returns an active track with exactly {id,title,artist,url,duration,category}", async () => {
    const active = await createTrack({ title: "Active Song", isActive: true });

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    const returned = body.tracks.find((track: { id: string }) => track.id === active.id);
    expect(returned).toEqual({
      id: active.id,
      title: active.title,
      artist: active.artist,
      url: active.url,
      duration: active.duration,
      category: active.category,
    });
  });

  it("excludes isActive: false tracks", async () => {
    const inactive = await createTrack({ title: "Inactive Song", isActive: false });

    const res = await GET();

    const body = await res.json();
    expect(body.tracks.some((track: { id: string }) => track.id === inactive.id)).toBe(false);
  });

  it("orders tracks by category then title", async () => {
    const bBeta = await createTrack({ category: "b", title: "Beta" });
    const aZeta = await createTrack({ category: "a", title: "Zeta" });
    const aAlpha = await createTrack({ category: "a", title: "Alpha" });

    const res = await GET();

    const body = await res.json();
    const ourIds = [aAlpha.id, aZeta.id, bBeta.id];
    const orderedOurs = body.tracks
      .map((track: { id: string }) => track.id)
      .filter((id: string) => ourIds.includes(id));
    expect(orderedOurs).toEqual([aAlpha.id, aZeta.id, bBeta.id]);
  });
});
