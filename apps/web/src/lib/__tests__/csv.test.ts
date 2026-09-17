import { describe, expect, it } from "vitest";
import { CSV_BOM, toCsv, uniqueHeaders } from "../csv";

/** Strips the BOM so a test can assert on the rows without it in the way. */
function body(csv: string): string {
  return csv.replace(/^\ufeff/, "");
}

describe("toCsv", () => {
  it("thêm BOM UTF-8 để Excel đọc đúng tiếng Việt", () => {
    expect(toCsv([{ a: "Đặng" }], ["a"]).startsWith("\ufeff")).toBe(true);
  });

  it("viết dòng tiêu đề trước rồi tới dữ liệu", () => {
    expect(body(toCsv([{ a: "1", b: "2" }], ["a", "b"]))).toBe("a,b\r\n1,2\r\n");
  });

  it("dùng CRLF theo RFC 4180 để Excel trên Windows không dồn thành một dòng", () => {
    expect(body(toCsv([{ a: "1" }, { a: "2" }], ["a"]))).toBe("a\r\n1\r\n2\r\n");
  });

  it("bọc ô chứa dấu phẩy, ngoặc kép hoặc xuống dòng", () => {
    expect(toCsv([{ a: "x,y" }], ["a"])).toContain('"x,y"');
    expect(toCsv([{ a: 'say "hi"' }], ["a"])).toContain('"say ""hi"""');
    expect(toCsv([{ a: "dòng 1\ndòng 2" }], ["a"])).toContain('"dòng 1\ndòng 2"');
  });

  it("không bọc ô bình thường", () => {
    expect(body(toCsv([{ a: "Nguyễn Văn An" }], ["a"]))).toBe("a\r\nNguyễn Văn An\r\n");
  });

  it("giữ đúng thứ tự cột và điền rỗng cho ô thiếu", () => {
    const rows: Record<string, string>[] = [{ b: "2", a: "1" }, { a: "3" }];

    expect(body(toCsv(rows, ["a", "b", "c"]))).toBe("a,b,c\r\n1,2,\r\n3,,\r\n");
  });

  it("vẫn xuất được dòng tiêu đề khi không có phản hồi nào", () => {
    expect(body(toCsv([], ["Thời gian", "Tên khách"]))).toBe("Thời gian,Tên khách\r\n");
  });

  describe("chống CSV injection", () => {
    // Dữ liệu do khách lạ nhập, chủ thiệp mở bằng Excel: một ô bắt đầu bằng
    // "=" sẽ được Excel chạy như công thức.
    it("thêm dấu nháy đơn trước ô bắt đầu bằng = + - @", () => {
      expect(toCsv([{ a: "=SUM(A1)" }], ["a"])).toContain("'=SUM(A1)");
      expect(toCsv([{ a: "+1" }], ["a"])).toContain("'+1");
      expect(toCsv([{ a: "-1+1" }], ["a"])).toContain("'-1+1");
      expect(toCsv([{ a: "@SUM(A1)" }], ["a"])).toContain("'@SUM(A1)");
    });

    it("chặn cả tab và carriage return đứng đầu ô", () => {
      // Excel/Sheets bỏ qua hai ký tự này rồi vẫn đọc "=" phía sau là công thức.
      expect(body(toCsv([{ a: "\t=SUM(A1)" }], ["a"]))).toContain("'\t=SUM(A1)");
      expect(body(toCsv([{ a: "\r=SUM(A1)" }], ["a"]))).toContain("'\r=SUM(A1)");
    });

    it("bọc VÀ thêm nháy khi công thức còn chứa dấu phẩy", () => {
      expect(body(toCsv([{ a: "=SUM(A1,B1)" }], ["a"]))).toBe("a\r\n\"'=SUM(A1,B1)\"\r\n");
    });

    it("làm sạch cả dòng tiêu đề, vì nhãn câu hỏi do chủ thiệp tự gõ", () => {
      expect(body(toCsv([], ["=SUM(A1)"]))).toBe("'=SUM(A1)\r\n");
    });

    it("không đụng tới số âm đã là chuỗi hợp lệ về mặt hiển thị", () => {
      // "-1" vẫn phải được bảo vệ: không có cách nào phân biệt nó với "-1+1"
      // mà không tự viết một trình phân tích công thức.
      expect(body(toCsv([{ a: "-1" }], ["a"]))).toBe("a\r\n'-1\r\n");
    });

    it("không thêm nháy vào ô bình thường", () => {
      expect(body(toCsv([{ a: "Có" }], ["a"]))).toBe("a\r\nCó\r\n");
      expect(body(toCsv([{ a: "" }], ["a"]))).toBe("a\r\n\r\n");
    });
  });
});

describe("uniqueHeaders", () => {
  // Chủ thiệp tự gõ nhãn câu hỏi nên hoàn toàn có thể đặt trùng nhau; nếu
  // dùng thẳng nhãn làm khoá thì cột sau sẽ ghi đè cột trước và mất dữ liệu.
  it("giữ nguyên khi các nhãn đã khác nhau", () => {
    expect(uniqueHeaders(["Tên", "Nhóm"])).toEqual(["Tên", "Nhóm"]);
  });

  it("đánh số các nhãn trùng thay vì để chúng đè lên nhau", () => {
    expect(uniqueHeaders(["Ghi chú", "Ghi chú", "Ghi chú"])).toEqual([
      "Ghi chú",
      "Ghi chú (2)",
      "Ghi chú (3)",
    ]);
  });

  it("không tạo ra trùng mới khi tên đã đánh số sẵn có thật", () => {
    expect(uniqueHeaders(["A", "A (2)", "A"])).toEqual(["A", "A (2)", "A (3)"]);
  });

  it("thay nhãn rỗng bằng tên cột có nghĩa", () => {
    expect(uniqueHeaders(["", ""])).toEqual(["Cột 1", "Cột 2"]);
  });
});

describe("CSV_BOM", () => {
  it("là đúng một ký tự U+FEFF", () => {
    expect(CSV_BOM).toBe("\ufeff");
  });
});
