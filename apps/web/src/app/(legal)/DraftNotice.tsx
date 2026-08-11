/**
 * Banner at the top of both legal pages. Per the Task 19 controller
 * resolution: this text is a draft written by the engineering team, not
 * reviewed by a lawyer — that must stay visible on the page itself, not
 * buried in a commit message, until a human clears it (see the report's
 * HUMAN TODO).
 */
export function DraftNotice() {
  return (
    <div
      role="note"
      className="mb-8 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <strong>Bản dự thảo:</strong> Nội dung này do đội ngũ kỹ thuật soạn để mô tả đúng cách sản phẩm hoạt
      động, <strong>chưa được luật sư rà soát</strong>. Vui lòng không coi đây là văn bản pháp lý cuối
      cùng.
    </div>
  );
}
