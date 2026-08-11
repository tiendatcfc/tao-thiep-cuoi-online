"use client";

import type { Section, VideoProps } from "@hpwd/schema";
import { useEditorStore } from "@/stores/editor-store";
import { TextField } from "../fields/TextField";

export function VideoPanel({ section }: { section: Extract<Section, { type: "video" }> }) {
  const updateSectionProps = useEditorStore((state) => state.updateSectionProps);
  const { youtubeId, caption } = section.props;

  function patch(next: Partial<VideoProps>) {
    updateSectionProps(section.id, next);
  }

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Mã video YouTube"
        value={youtubeId}
        onChange={(v) => patch({ youtubeId: v })}
        hint="Phần sau youtube.com/watch?v= trong đường dẫn video, ví dụ dQw4w9WgXcQ"
      />
      <TextField label="Chú thích" value={caption} onChange={(v) => patch({ caption: v })} />
    </div>
  );
}
