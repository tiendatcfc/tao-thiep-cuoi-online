import { NextResponse } from "next/server";
import { prisma } from "@hpwd/db";

/**
 * Public: the music-library picker (`MusicPanel`, Task 16) and `MusicPlayer`
 * (library-source resolution by `trackId`) both consume this. Only active
 * tracks are exposed — an editor that later disables a track shouldn't have
 * it resurface for anyone still browsing the library — ordered by category
 * then title so the picker can group tracks by category without an extra
 * client-side sort.
 */
export async function GET() {
  const tracks = await prisma.musicTrack.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { title: "asc" }],
    select: { id: true, title: true, artist: true, url: true, duration: true, category: true },
  });

  return NextResponse.json({ tracks });
}
