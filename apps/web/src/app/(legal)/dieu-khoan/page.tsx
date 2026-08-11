import type { Metadata } from "next";
import { DraftNotice } from "../DraftNotice";
import { LegalSection } from "../LegalSection";
import { LEGAL_LAST_UPDATED, OPERATOR_CONTACT_EMAIL } from "../constants";

export const metadata: Metadata = {
  title: "Điều khoản sử dụng — HPWD",
  description: "Điều khoản sử dụng dịch vụ tạo thiệp cưới online miễn phí HPWD.",
};

/**
 * `/dieu-khoan` — Điều khoản sử dụng. Content is a straightforward
 * description of what this product actually does (free, Google sign-in,
 * no uptime SLA) rather than boilerplate copied from elsewhere — see the
 * `DraftNotice` banner for the caveat that a lawyer hasn't reviewed it yet.
 */
export default function DieuKhoanPage() {
  return (
    <>
      <DraftNotice />
      <h1 className="text-3xl font-bold text-gray-900">Điều khoản sử dụng</h1>
      <p className="mt-2 text-sm text-gray-500">Cập nhật lần cuối: {LEGAL_LAST_UPDATED}</p>

      <LegalSection title="1. Dịch vụ">
        <p>
          HPWD là dịch vụ tạo thiệp cưới online: bạn thiết kế một thiệp bằng các mục có sẵn (bìa, cô dâu
          chú rể, sự kiện, album ảnh, hộp mừng, sổ lời chúc, RSVP...), xuất bản thiệp tại một đường link
          riêng, rồi chia sẻ đường link đó cho khách mời.
        </p>
        <p>
          Dịch vụ hiện tại <strong>hoàn toàn miễn phí</strong> — không có gói trả phí, không watermark,
          không giới hạn thời gian dùng. Chúng tôi có thể bổ sung các mẫu thiệp hoặc tính năng trả phí
          trong tương lai; nếu có, điều khoản này sẽ được cập nhật trước khi tính năng đó ra mắt.
        </p>
      </LegalSection>

      <LegalSection title="2. Tài khoản">
        <p>
          Bạn đăng nhập bằng tài khoản Google — HPWD không có hình thức đăng ký bằng email/mật khẩu riêng.
          Bạn chịu trách nhiệm giữ an toàn cho tài khoản Google của mình; mọi hành động thực hiện từ tài
          khoản đã đăng nhập (tạo, sửa, xuất bản, xoá thiệp) được coi là do bạn thực hiện.
        </p>
      </LegalSection>

      <LegalSection title="3. Nội dung bạn đăng tải">
        <p>
          Bạn chịu trách nhiệm về nội dung mình đăng lên thiệp: văn bản, ảnh, âm thanh, thông tin tài khoản
          ngân hàng dùng cho hộp mừng cưới. Vui lòng chỉ đăng nội dung bạn có quyền sử dụng và không đăng
          nội dung vi phạm pháp luật Việt Nam.
        </p>
        <p>
          Một khi thiệp được xuất bản, đường link của thiệp là công khai — bất kỳ ai có đường link đều xem
          được, không cần đăng nhập.
        </p>
      </LegalSection>

      <LegalSection title="4. Lời chúc và phản hồi từ khách mời">
        <p>
          Khách mời có thể gửi lời chúc và điền form RSVP trên thiệp của bạn. Nếu bạn bật kiểm duyệt cho sổ
          lời chúc, lời chúc chỉ hiển thị công khai sau khi bạn duyệt; dù bật hay không, mọi lời chúc và
          phản hồi RSVP đều hiển thị cho bạn (chủ thiệp) ngay khi khách gửi, tại trang quản lý thiệp.
        </p>
      </LegalSection>

      <LegalSection title="5. Không đảm bảo về thời gian hoạt động">
        <p>
          HPWD được cung cấp <strong>&quot;nguyên trạng&quot;</strong> (as-is), miễn phí, không có cam kết
          về thời gian hoạt động (uptime) hay SLA. Chúng tôi cố gắng giữ dịch vụ hoạt động ổn định nhưng
          không đảm bảo dịch vụ luôn sẵn sàng, không có lỗi, hoặc không bị gián đoạn — đặc biệt trong giai
          đoạn phát triển sớm này.
        </p>
        <p>
          Trong phạm vi pháp luật cho phép, HPWD không chịu trách nhiệm cho thiệt hại phát sinh từ việc
          dịch vụ ngừng hoạt động, mất dữ liệu, hoặc sự cố kỹ thuật — dù vậy, chúng tôi vẫn khuyến khích bạn
          giữ lại một bản sao ảnh/nội dung quan trọng ở nơi khác.
        </p>
      </LegalSection>

      <LegalSection title="6. Chấm dứt và xoá tài khoản">
        <p>
          Bạn có thể xoá một thiệp bất kỳ lúc nào bằng nút &quot;Xoá&quot; trong trang quản lý thiệp — việc
          này xoá vĩnh viễn thiệp cùng toàn bộ khách mời, lời chúc và phản hồi RSVP liên quan. Nếu muốn xoá
          toàn bộ tài khoản, vui lòng liên hệ theo mục 7 bên dưới.
        </p>
      </LegalSection>

      <LegalSection title="7. Liên hệ">
        <p>
          Mọi câu hỏi về điều khoản sử dụng, vui lòng liên hệ: <strong>{OPERATOR_CONTACT_EMAIL}</strong>.
        </p>
      </LegalSection>
    </>
  );
}
