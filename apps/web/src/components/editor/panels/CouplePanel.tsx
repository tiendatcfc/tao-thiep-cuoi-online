"use client";

import type { CoupleProps, Section } from "@hpwd/schema";
import { useEditorStore } from "@/stores/editor-store";
import { ImageField } from "../fields/ImageField";
import { TextAreaField } from "../fields/TextAreaField";
import { TextField } from "../fields/TextField";

type Person = CoupleProps["groom"];

function PersonFields({
  legend,
  person,
  onChange,
}: {
  legend: string;
  person: Person;
  onChange: (next: Person) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-xs font-semibold uppercase tracking-wide text-gray-400">{legend}</legend>
      <TextField label="Họ và tên" value={person.name} onChange={(v) => onChange({ ...person, name: v })} />
      <ImageField label="Ảnh" value={person.photo} onChange={(v) => onChange({ ...person, photo: v })} />
      <TextAreaField label="Giới thiệu" value={person.intro} onChange={(v) => onChange({ ...person, intro: v })} />
      <TextField label="Phụ huynh" value={person.parents} onChange={(v) => onChange({ ...person, parents: v })} />
    </fieldset>
  );
}

export function CouplePanel({ section }: { section: Extract<Section, { type: "couple" }> }) {
  const updateSectionProps = useEditorStore((state) => state.updateSectionProps);
  const { groom, bride } = section.props;

  return (
    <div className="flex flex-col gap-6">
      <PersonFields legend="Chú rể" person={groom} onChange={(next) => updateSectionProps(section.id, { groom: next })} />
      <PersonFields legend="Cô dâu" person={bride} onChange={(next) => updateSectionProps(section.id, { bride: next })} />
    </div>
  );
}
