import type { SectionType } from "@hpwd/schema";

/** Vietnamese display name for each section type — used by `SectionList`'s rows and its "+ Thêm mục" add control. */
export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  cover: "Trang bìa",
  couple: "Cô dâu chú rể",
  story: "Câu chuyện tình yêu",
  events: "Sự kiện",
  album: "Album ảnh",
  video: "Video",
  gift: "Hộp mừng cưới",
  wishes: "Sổ lời chúc",
  form: "Biểu mẫu",
  text: "Văn bản",
  dresscode: "Dress code",
  timeline: "Lịch trình",
};
