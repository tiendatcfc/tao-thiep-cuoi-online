import type { Metadata } from "next";
import { DraftNotice } from "../DraftNotice";
import { LegalSection } from "../LegalSection";
import { LEGAL_LAST_UPDATED, OPERATOR_CONTACT_EMAIL } from "../constants";

export const metadata: Metadata = {
  title: "Chính sách bảo mật — HPWD",
  description: "Chính sách bảo mật dữ liệu của dịch vụ tạo thiệp cưới online HPWD.",
};

/**
 * `/bao-mat` — Chính sách bảo mật. Lists what's actually stored (checked
 * against `packages/db/prisma/schema.prisma`'s `User`/`Invitation`/
 * `Guest`/`Wish`/`FormSubmission` models) rather than generic privacy-policy
 * boilerplate — see `DraftNotice` for the not-lawyer-reviewed caveat.
 */
export default function BaoMatPage() {
  return (
    <>
      <DraftNotice />
      <h1 className="text-3xl font-bold text-gray-900">Chính sách bảo mật</h1>
      <p className="mt-2 text-sm text-gray-500">Cập nhật lần cuối: {LEGAL_LAST_UPDATED}</p>

      <LegalSection title="1. Dữ liệu chúng tôi thu thập">
        <p>Chúng tôi lưu trữ những dữ liệu sau, chỉ để vận hành dịch vụ:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Thông tin tài khoản:</strong> email và tên hiển thị lấy từ tài khoản Google bạn dùng để
            đăng nhập.
          </li>
          <li>
            <strong>Nội dung thiệp:</strong> toàn bộ nội dung bạn nhập vào thiệp (tên, ngày cưới, câu
            chuyện, sự kiện, thông tin tài khoản ngân hàng cho hộp mừng, v.v.).
          </li>
          <li>
            <strong>File bạn tải lên:</strong> ảnh album, ảnh bìa, và file nhạc nền bạn tải lên khi tạo
            thiệp.
          </li>
          <li>
            <strong>Dữ liệu khách mời:</strong> tên khách mời (nếu thiệp của bạn dùng link cá nhân hoá cho
            từng khách), và nội dung khách gửi — lời chúc, câu trả lời form RSVP.
          </li>
          <li>
            <strong>Số lượt xem:</strong> số lần thiệp được mở (view count), không gắn với danh tính người
            xem cụ thể.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Chúng tôi KHÔNG dùng bên phân tích/theo dõi thứ ba">
        <p>
          HPWD không nhúng Google Analytics, Facebook Pixel, hay bất kỳ công cụ phân tích/theo dõi của bên
          thứ ba nào vào thiệp hay trang web. Số lượt xem ở mục 1 được đếm bởi hệ thống của chúng tôi, không
          qua bên thứ ba nào.
        </p>
      </LegalSection>

      <LegalSection title="3. Ai xem được dữ liệu gì">
        <p>
          Nội dung thiệp sau khi xuất bản là <strong>công khai</strong> với bất kỳ ai có đường link. Lời
          chúc và phản hồi RSVP của khách mời <strong>luôn hiển thị cho chủ thiệp</strong> (bạn) tại trang
          quản lý — kể cả khi bạn bật kiểm duyệt (kiểm duyệt chỉ ẩn/hiện với khách khác, không ẩn với bạn).
          Tên khách mời gắn với link cá nhân hoá chỉ hiển thị cho chủ thiệp và người cầm link đó.
        </p>
        <p>
          Đội ngũ vận hành HPWD có thể truy cập dữ liệu trong cơ sở dữ liệu khi cần để vận hành, gỡ lỗi,
          hoặc xử lý yêu cầu hỗ trợ — chúng tôi không bán hay chia sẻ dữ liệu này cho bên thứ ba nhằm mục
          đích quảng cáo.
        </p>
      </LegalSection>

      <LegalSection title="4. Lưu trữ dữ liệu">
        <p>
          Dữ liệu văn bản (tài khoản, nội dung thiệp, lời chúc, RSVP) được lưu trong cơ sở dữ liệu của
          chúng tôi. Ảnh và file nhạc bạn tải lên được lưu ở dịch vụ lưu trữ đối tượng (object storage)
          riêng của chúng tôi, không phải trên máy chủ của bên thứ ba nào khác ngoài nhà cung cấp hạ tầng
          lưu trữ đó.
        </p>
        <p>
          File nhạc bạn tải lên được hệ thống tự động chuyển sang định dạng khác để phát được trên mọi
          trình duyệt. Sau khi chuyển đổi xong, <strong>file gốc bạn tải lên được xoá khỏi hệ thống</strong>;
          chúng tôi chỉ giữ lại file đã chuyển đổi. Vì nhạc là một phần của thiệp, file đã chuyển đổi{" "}
          <strong>tải về được bởi bất kỳ ai có đường link thiệp</strong> của bạn, giống như ảnh trong thiệp.
        </p>
      </LegalSection>

      <LegalSection title="5. Yêu cầu xoá dữ liệu">
        <p>
          Bạn có thể tự xoá một thiệp bất kỳ lúc nào bằng nút <strong>&quot;Xoá&quot;</strong> tại trang
          quản lý thiệp (dashboard) — việc này xoá ngay và vĩnh viễn thiệp đó cùng toàn bộ khách mời, lời
          chúc và phản hồi RSVP liên quan đến thiệp đó.
        </p>
        <p>
          Để yêu cầu xoá toàn bộ dữ liệu tài khoản (bao gồm mọi thiệp), vui lòng liên hệ:{" "}
          <strong>{OPERATOR_CONTACT_EMAIL}</strong>. Chúng tôi sẽ xử lý yêu cầu trong thời gian sớm nhất có
          thể.
        </p>
      </LegalSection>

      <LegalSection title="6. Trẻ em">
        <p>
          HPWD không hướng đến trẻ em và không cố ý thu thập dữ liệu của trẻ em. Nội dung thiệp cưới do
          người dùng tự nhập, có thể chứa tên/ảnh của khách mời ở mọi lứa tuổi do chủ thiệp tự quyết định
          đăng tải.
        </p>
      </LegalSection>

      <LegalSection title="7. Thay đổi chính sách">
        <p>
          Nếu chính sách này thay đổi đáng kể, chúng tôi sẽ cập nhật ngày &quot;Cập nhật lần cuối&quot; ở
          đầu trang. Vì đây là bản dự thảo giai đoạn đầu (xem thông báo ở trên), nội dung có thể thay đổi
          khi sản phẩm có thêm tính năng mới.
        </p>
      </LegalSection>

      <LegalSection title="8. Liên hệ">
        <p>
          Mọi câu hỏi về quyền riêng tư và dữ liệu, vui lòng liên hệ: <strong>{OPERATOR_CONTACT_EMAIL}</strong>.
        </p>
      </LegalSection>
    </>
  );
}
