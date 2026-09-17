import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Hard ceiling for one transcode. A wedding music track is a few minutes and
 * converts in well under a second, so anything approaching this is a
 * pathological or malicious input rather than a slow machine. Without it a
 * single crafted file could pin a worker slot forever.
 */
const TIMEOUT_MS = 120_000;

/**
 * ffmpeg writes progress to stderr; the default 1MB buffer is plenty at
 * `-loglevel error`, but a failing input can produce a long error dump and
 * overflowing the buffer would mask the real message with ENOBUFS.
 */
const MAX_BUFFER_BYTES = 4 * 1024 * 1024;

/**
 * Restricts which protocols the demuxer may open while reading the input.
 *
 * The input is a file a GUEST uploaded. Several ffmpeg demuxers (`concat`,
 * HLS playlists) will happily follow references out of the file into other
 * local paths or remote URLs, which turns "transcode my song" into an
 * arbitrary-file-read and SSRF primitive. Local audio decoding only ever
 * needs the `file` protocol, so everything else is refused up front.
 */
const ALLOWED_PROTOCOLS = "file";

function describeFailure(binary: string, error: unknown): Error {
  const err = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean; code?: number | string };

  if (err?.code === "ENOENT") {
    return new Error(
      `${binary} not found on PATH. Install it (macOS: brew install ffmpeg) before starting the worker.`,
    );
  }
  if (err?.killed) {
    return new Error(`${binary} timed out after ${TIMEOUT_MS / 1000}s and was killed.`);
  }

  // ffmpeg's own stderr is the only thing that says WHY a file was rejected
  // ("Invalid data found when processing input"), so it is carried into the
  // message rather than thrown away — this text ends up in MediaAsset.meta.error.
  const detail = (err?.stderr ?? "").trim().split("\n").slice(-3).join(" ").trim();
  return new Error(`${binary} failed${detail ? `: ${detail}` : ""}`);
}

/** Seconds of playable audio in `path`, via ffprobe's container metadata. */
async function probeDurationSeconds(path: string): Promise<number> {
  let stdout: string;
  try {
    ({ stdout } = await run(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
      { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER_BYTES },
    ));
  } catch (error) {
    throw describeFailure("ffprobe", error);
  }

  // A container with no duration in its header reports "N/A", which
  // parseFloat turns into NaN — storing that would put `null`-ish garbage in
  // MediaAsset.meta and break any player UI that formats it.
  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`ffprobe could not determine the duration of the transcoded file (got "${stdout.trim()}")`);
  }
  return seconds;
}

/**
 * Transcodes any audio file ffmpeg can decode into a 128kbps stereo AAC track
 * in an MP4/M4A container, and reports how long the result plays.
 *
 * AAC/M4A rather than the uploaded format verbatim: it is the one lossy codec
 * every current browser plays, it normalises wildly varying upload bitrates
 * to a predictable size, and re-encoding through ffmpeg strips whatever
 * metadata, cover art or malformed structure the source carried.
 *
 * Both paths must be absolute paths the CALLER chose (a temp file it created),
 * never a value taken straight from a user: ffmpeg reads a leading `-` as an
 * option, so a user-controlled filename could inject flags.
 *
 * Rejects — never resolves with a half-written file — when ffmpeg is missing,
 * the input is not decodable audio, or the work exceeds the timeout.
 */
export async function transcodeToAac(
  inputPath: string,
  outputPath: string,
): Promise<{ durationSeconds: number }> {
  try {
    await run(
      "ffmpeg",
      [
        // Never read from stdin: under a process manager stdin may be a pipe
        // that never closes, and ffmpeg would block on it forever.
        "-nostdin",
        "-loglevel",
        "error",
        "-protocol_whitelist",
        ALLOWED_PROTOCOLS,
        "-i",
        inputPath,
        "-vn", // drop cover art; an attached picture would otherwise become a video stream the M4A muxer trips over
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-y",
        outputPath,
      ],
      { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER_BYTES },
    );
  } catch (error) {
    throw describeFailure("ffmpeg", error);
  }

  return { durationSeconds: await probeDurationSeconds(outputPath) };
}
