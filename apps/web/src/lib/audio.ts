/**
 * Shared rules for user-uploaded background music. Kept in one module so the
 * API route, the editor panel's client-side pre-check and the tests all agree
 * on the cap and the accepted formats — a client that allows a format the
 * server rejects surfaces as an unexplained 400 after the file has already
 * been read and sent.
 */

/**
 * 15MB. A ~4 minute MP3 at 320kbps is about 9MB, so this accepts a
 * high-bitrate full-length song while keeping the ceiling on what a single
 * request buffers in memory (`request.formData()` holds the entire body).
 */
export const MAX_AUDIO_SIZE_BYTES = 15 * 1024 * 1024;

/**
 * Accepted upload types. `audio/mp4` and `audio/x-m4a` are the same
 * container under two spellings — browsers disagree about which one they
 * report for a `.m4a` file, so both have to be listed or Safari and Chrome
 * behave differently for the identical file.
 */
export const AUDIO_CONTENT_TYPES = ["audio/mpeg", "audio/mp4", "audio/x-m4a"] as const;
export type AudioContentType = (typeof AUDIO_CONTENT_TYPES)[number];

/** `accept` attribute for the file picker. Extensions are included because some systems report an empty MIME type for a local file. */
export const AUDIO_ACCEPT_ATTRIBUTE = "audio/mpeg,audio/mp4,audio/x-m4a,.mp3,.m4a";

const EXTENSION_BY_CONTENT_TYPE: Record<AudioContentType, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
};

export function isAudioContentType(value: string): value is AudioContentType {
  return (AUDIO_CONTENT_TYPES as readonly string[]).includes(value);
}

export function audioExtension(contentType: AudioContentType): string {
  return EXTENSION_BY_CONTENT_TYPE[contentType];
}

/**
 * Object key for the file as the user uploaded it, before transcoding.
 *
 * `-source` keeps it distinct from the transcoded `u/{userId}/{assetId}.m4a`
 * the worker writes: an `.m4a` upload would otherwise have the worker read
 * and overwrite the very object it is reading from.
 */
export function audioSourceKey(userId: string, assetId: string, contentType: AudioContentType): string {
  return `u/${userId}/${assetId}-source.${audioExtension(contentType)}`;
}
