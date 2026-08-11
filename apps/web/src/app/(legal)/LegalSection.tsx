import type { ReactNode } from "react";

/**
 * One numbered/titled section of body text, shared by `dieu-khoan` and
 * `bao-mat` so both pages get the same heading/paragraph styling without
 * each re-typing the same `className`s ~10 times.
 */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mt-8 text-xl font-semibold text-gray-900">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}
