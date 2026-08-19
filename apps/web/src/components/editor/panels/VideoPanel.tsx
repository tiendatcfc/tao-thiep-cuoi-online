"use client";

import type { Section, VideoProps } from "@hpwd/schema";
import { parseYoutubeId } from "@/lib/youtube";
import { useEditorStore } from "@/stores/editor-store";
import { TextField } from "../fields/TextField";

export function VideoPanel({ section }: { section: Extract<Section, { type: "video" }> }) {
  const updateSectionProps = useEditorStore((state) => state.updateSectionProps);
  const { youtubeId, caption } = section.props;

  function patch(next: Partial<VideoProps>) {
    updateSectionProps(section.id, next);
  }

  const unparseable = youtubeId !== "" && parseYoutubeId(youtubeId) === null;

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Video YouTube"
        value={youtubeId}
        // A pasted URL is normalized to the bare id; anything unparseable is
        // stored as typed (schema allows any string — see Global Constraint 2)
        // and flagged below instead of silently dropped mid-typing.
        onChange={(v) => patch({ youtubeId: parseYoutubeId(v) ?? v })}
        hint="Dán liên kết YouTube (youtube.com/watch?v=…, youtu.be/…) hoặc mã video 11 ký tự, ví dụ dQw4w9WgXcQ"
      />
      {unparseable ? (
        <p className="text-xs text-red-500" role="alert">
          Không nhận diện được video — video sẽ không hiển thị trên thiệp cho tới khi liên kết hợp lệ.
        </p>
      ) : null}
      <TextField label="Chú thích" value={caption} onChange={(v) => patch({ caption: v })} />
    </div>
  );
}
