import { execFile, spawnSync } from "node:child_process";
import { mkdtemp, rm, stat, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { transcodeToAac } from "../ffmpeg";

const run = promisify(execFile);

/**
 * These tests drive REAL ffmpeg, not a mock. Transcoding is the one thing
 * this module does, and a mocked `execFile` would only assert that we build
 * the argument string we already wrote — it could not catch a wrong codec, a
 * container ffmpeg refuses to write, or a duration we parse out of the wrong
 * ffprobe field.
 */
// Probed SYNCHRONOUSLY at module scope, not in `beforeAll`: vitest evaluates
// `describe.skipIf(...)` while collecting tests, which happens BEFORE any
// hook runs. A flag assigned in `beforeAll` is still `false` at that moment,
// so the whole suite would report "skipped" on every machine, ffmpeg present
// or not — the silent no-op this file exists to rule out.
function hasBinary(name: string): boolean {
  const result = spawnSync(name, ["-version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

const ffmpegAvailable = hasBinary("ffmpeg") && hasBinary("ffprobe");
let workDir = "";

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "hpwd-ffmpeg-test-"));
});

afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

/** Writes a 2-second 440Hz sine WAV — a real audio file, generated on the fly so no binary fixture is committed. */
async function makeSineWav(path: string, seconds = 2): Promise<void> {
  await run("ffmpeg", [
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${seconds}`,
    "-y",
    path,
  ]);
}

/** Reads the codec ffprobe reports for the first audio stream — independent confirmation, not a re-read of our own output parsing. */
async function probeCodec(path: string): Promise<string> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "stream=codec_name",
    "-of",
    "csv=p=0",
    path,
  ]);
  return stdout.trim();
}

// `describe.skipIf` rather than a silent early return: when ffmpeg is missing
// the suite reports SKIPPED, which is visible in the run output. A test that
// returns early would report PASSED and quietly assert nothing at all.
describe.skipIf(!ffmpegAvailable)("transcodeToAac (requires ffmpeg + ffprobe on PATH)", () => {
  it("writes a real AAC/M4A file and reports its duration", async () => {
    const input = join(workDir, "input.wav");
    const output = join(workDir, "output.m4a");
    await makeSineWav(input, 2);

    const result = await transcodeToAac(input, output);

    await expect(stat(output)).resolves.toBeTruthy();
    expect((await stat(output)).size).toBeGreaterThan(0);
    expect(result.durationSeconds).toBeGreaterThan(1.7);
    expect(result.durationSeconds).toBeLessThan(2.3);
    expect(await probeCodec(output)).toBe("aac");
  });

  it("writes an ISO base-media container, checked at the byte level", async () => {
    const input = join(workDir, "magic-input.wav");
    const output = join(workDir, "magic-output.m4a");
    await makeSineWav(input, 1);

    await transcodeToAac(input, output);

    // Bytes 4..8 of an MP4/M4A file are the literal "ftyp" box type. Checked
    // on the raw bytes because a browser <audio> decides what it will play
    // from the container, not from the file extension we chose.
    const handle = await open(output, "r");
    try {
      const buffer = Buffer.alloc(8);
      await handle.read(buffer, 0, 8, 0);
      expect(buffer.subarray(4, 8).toString("latin1")).toBe("ftyp");
    } finally {
      await handle.close();
    }
  });

  it("reports a duration that tracks the source, not a hardcoded value", async () => {
    const input = join(workDir, "five.wav");
    const output = join(workDir, "five.m4a");
    await makeSineWav(input, 5);

    const result = await transcodeToAac(input, output);

    expect(result.durationSeconds).toBeGreaterThan(4.7);
    expect(result.durationSeconds).toBeLessThan(5.3);
  });

  it("rejects with a readable error when the input is not audio", async () => {
    const input = join(workDir, "not-audio.txt");
    const output = join(workDir, "not-audio.m4a");
    const handle = await open(input, "w");
    await handle.write("day khong phai file nhac");
    await handle.close();

    // A guest-supplied file that merely has the right extension must surface
    // as a rejected promise the job handler can mark as failed, never as a
    // resolved promise pointing at a zero-byte "result".
    await expect(transcodeToAac(input, output)).rejects.toThrow(/ffmpeg/i);
  });

  it("rejects when the input file does not exist at all", async () => {
    await expect(
      transcodeToAac(join(workDir, "missing.wav"), join(workDir, "missing.m4a")),
    ).rejects.toThrow(/ffmpeg/i);
  });
});
