import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { MAX_IMPORT_ROWS, parseGuestFile } from "../guest-import";

function csvFile(content: string, name = "khach.csv"): File {
  return new File([content], name, { type: "text/csv" });
}

describe("parseGuestFile — CSV", () => {
  it("đọc CSV có tiêu đề tiếng Việt: Tên, Nhóm, Ghi chú", async () => {
    const csv = "Tên,Nhóm,Ghi chú\nNguyễn Văn An,Nhà trai,Bạn đại học\nTrần Thị Bình,Nhà gái,\n";

    const result = await parseGuestFile(csvFile(csv));

    expect(result.rows).toEqual([
      { name: "Nguyễn Văn An", group: "Nhà trai", note: "Bạn đại học" },
      { name: "Trần Thị Bình", group: "Nhà gái" },
    ]);
    expect(result.skipped).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("chấp nhận tiêu đề không dấu và khác hoa thường (ten, nhom)", async () => {
    const csv = "TEN,nhom,GHI CHU\nLê Văn Cường,Bạn bè,Cùng lớp\n";

    const result = await parseGuestFile(csvFile(csv));

    expect(result.rows).toEqual([{ name: "Lê Văn Cường", group: "Bạn bè", note: "Cùng lớp" }]);
  });

  it("nhận tiêu đề tiếng Anh name/group/note", async () => {
    const csv = "Name,Group,Note\nJohn Smith,Friends,Colleague\n";

    const result = await parseGuestFile(csvFile(csv));

    expect(result.rows).toEqual([{ name: "John Smith", group: "Friends", note: "Colleague" }]);
  });

  it("dùng cột đầu làm tên khi không nhận ra tiêu đề nào", async () => {
    // Không có dòng tiêu đề — dòng đầu tiên đã là dữ liệu và phải được giữ lại.
    const csv = "Nguyễn Văn An,Nhà trai\nTrần Thị Bình,Nhà gái\n";

    const result = await parseGuestFile(csvFile(csv));

    expect(result.rows).toEqual([{ name: "Nguyễn Văn An" }, { name: "Trần Thị Bình" }]);
    expect(result.warnings.join(" ")).toMatch(/cột đầu/i);
  });

  it("bỏ qua dòng có tên rỗng và đếm vào skipped", async () => {
    const csv = "Tên,Nhóm\nNguyễn Văn An,Nhà trai\n,Nhà gái\n   ,Nhà gái\nTrần Thị Bình,\n";

    const result = await parseGuestFile(csvFile(csv));

    expect(result.rows.map((r) => r.name)).toEqual(["Nguyễn Văn An", "Trần Thị Bình"]);
    expect(result.skipped).toBe(2);
  });

  it("xử lý ô có dấu phẩy trong ngoặc kép", async () => {
    const csv = 'Tên,Nhóm\n"Nguyễn Văn An","Nhà trai, bạn thân"\n';

    const result = await parseGuestFile(csvFile(csv));

    expect(result.rows).toEqual([{ name: "Nguyễn Văn An", group: "Nhà trai, bạn thân" }]);
  });

  it('hiểu "" là một dấu ngoặc kép bên trong ô', async () => {
    const csv = 'Tên,Ghi chú\nNguyễn Văn An,"Biệt danh ""Bo"" ở nhà"\n';

    const result = await parseGuestFile(csvFile(csv));

    expect(result.rows).toEqual([{ name: "Nguyễn Văn An", note: 'Biệt danh "Bo" ở nhà' }]);
  });

  it("bỏ BOM ở đầu file xuất từ Excel", async () => {
    const csv = "\ufeffTên,Nhóm\nNguyễn Văn An,Nhà trai\n";

    const result = await parseGuestFile(csvFile(csv));

    // Nếu BOM dính vào tiêu đề thì "Tên" không khớp và cột name sẽ hỏng.
    expect(result.rows).toEqual([{ name: "Nguyễn Văn An", group: "Nhà trai" }]);
  });

  it("đọc được file dùng xuống dòng CRLF của Windows", async () => {
    const csv = "Tên,Nhóm\r\nNguyễn Văn An,Nhà trai\r\nTrần Thị Bình,Nhà gái\r\n";

    const result = await parseGuestFile(csvFile(csv));

    expect(result.rows).toEqual([
      { name: "Nguyễn Văn An", group: "Nhà trai" },
      { name: "Trần Thị Bình", group: "Nhà gái" },
    ]);
  });

  it("giữ nguyên xuống dòng nằm trong ô có ngoặc kép", async () => {
    const csv = 'Tên,Ghi chú\nNguyễn Văn An,"dòng 1\ndòng 2"\n';

    const result = await parseGuestFile(csvFile(csv));

    expect(result.rows).toEqual([{ name: "Nguyễn Văn An", note: "dòng 1\ndòng 2" }]);
  });

  it("loại trùng theo tên đã chuẩn hoá, giữ bản đầu, ghi cảnh báo", async () => {
    const csv = "Tên,Nhóm\nNguyễn Văn An,Nhà trai\nnguyễn  văn an,Nhà gái\nTrần Thị Bình,\n";

    const result = await parseGuestFile(csvFile(csv));

    expect(result.rows).toEqual([
      { name: "Nguyễn Văn An", group: "Nhà trai" },
      { name: "Trần Thị Bình" },
    ]);
    expect(result.warnings.join(" ")).toMatch(/trùng/i);
  });

  it("phân biệt hai người khác dấu tiếng Việt (Hà vs Hạ)", async () => {
    // Chuẩn hoá chỉ gộp khoảng trắng và hoa/thường — KHÔNG được bỏ dấu,
    // nếu không hai khách khác nhau sẽ bị coi là một.
    // A minimal pair: identical but for the tone mark on the last letter.
    // Anything less makes this test pass even if dedupe folded diacritics.
    const csv = "Tên\nLê Thị Hà\nLê Thị Hạ\n";

    const result = await parseGuestFile(csvFile(csv));

    expect(result.rows.map((r) => r.name)).toEqual(["Lê Thị Hà", "Lê Thị Hạ"]);
    expect(result.warnings).toEqual([]);
  });

  it(`từ chối file quá ${MAX_IMPORT_ROWS} dòng với cảnh báo tiếng Việt`, async () => {
    const body = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Khách số ${i}`).join("\n");

    const result = await parseGuestFile(csvFile(`Tên\n${body}\n`));

    expect(result.rows).toEqual([]);
    expect(result.warnings.join(" ")).toContain(String(MAX_IMPORT_ROWS));
    expect(result.warnings.join(" ")).toMatch(/[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩậắằẳẵặẹẻẽềềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i);
  });

  it(`chấp nhận đúng ${MAX_IMPORT_ROWS} dòng`, async () => {
    const body = Array.from({ length: MAX_IMPORT_ROWS }, (_, i) => `Khách số ${i}`).join("\n");

    const result = await parseGuestFile(csvFile(`Tên\n${body}\n`));

    expect(result.rows).toHaveLength(MAX_IMPORT_ROWS);
  });

  it("cắt ghi chú quá dài thay vì để API trả 400", async () => {
    // API giới hạn note 500 ký tự; parser phải cắt trước khi POST.
    const csv = `Tên,Ghi chú\nNguyễn Văn An,${"x".repeat(900)}\n`;

    const result = await parseGuestFile(csvFile(csv));

    expect(result.rows[0].note).toHaveLength(500);
  });

  it("cắt nhóm quá dài thay vì để API trả 400", async () => {
    const csv = `Tên,Nhóm\nNguyễn Văn An,${"y".repeat(200)}\n`;

    const result = await parseGuestFile(csvFile(csv));

    expect(result.rows[0].group).toHaveLength(80);
  });

  it("bỏ ô rỗng thay vì gửi chuỗi rỗng cho API", async () => {
    const csv = "Tên,Nhóm,Ghi chú\nNguyễn Văn An,   ,\n";

    const result = await parseGuestFile(csvFile(csv));

    expect(result.rows).toEqual([{ name: "Nguyễn Văn An" }]);
  });

  it("bỏ qua dòng trống hoàn toàn mà không tính là skipped", async () => {
    const csv = "Tên,Nhóm\nNguyễn Văn An,Nhà trai\n\n\nTrần Thị Bình,Nhà gái\n";

    const result = await parseGuestFile(csvFile(csv));

    expect(result.rows).toHaveLength(2);
    expect(result.skipped).toBe(0);
  });

  it("trả kết quả rỗng kèm cảnh báo cho file không có dòng nào", async () => {
    const result = await parseGuestFile(csvFile("Tên,Nhóm\n"));

    expect(result.rows).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("loại ký tự điều khiển khỏi tên qua normalizeGuestName", async () => {
    const csv = `Tên\nNguyễn${String.fromCharCode(7)} Văn An\n`;

    const result = await parseGuestFile(csvFile(csv));

    expect(result.rows).toEqual([{ name: "Nguyễn Văn An" }]);
  });

  it("từ chối phần mở rộng lạ với cảnh báo tiếng Việt", async () => {
    const result = await parseGuestFile(new File(["x"], "khach.pdf", { type: "application/pdf" }));

    expect(result.rows).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/csv|excel/i);
  });
});


describe("parseGuestFile — Excel", () => {
  /** Builds a real .xlsx byte stream, not a stub — the point is to exercise exceljs. */
  async function xlsxFile(rows: (string | number | null)[][], name = "khach.xlsx"): Promise<File> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Khách mời");
    for (const row of rows) sheet.addRow(row);
    const buffer = await workbook.xlsx.writeBuffer();
    return new File([buffer], name, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  it("đọc sheet đầu tiên với tiêu đề tiếng Việt", async () => {
    const file = await xlsxFile([
      ["Tên", "Nhóm", "Ghi chú"],
      ["Nguyễn Văn An", "Nhà trai", "Bạn đại học"],
      ["Trần Thị Bình", "Nhà gái", null],
    ]);

    const result = await parseGuestFile(file);

    expect(result.rows).toEqual([
      { name: "Nguyễn Văn An", group: "Nhà trai", note: "Bạn đại học" },
      { name: "Trần Thị Bình", group: "Nhà gái" },
    ]);
    expect(result.skipped).toBe(0);
  });

  it("đi qua đúng đường xử lý như CSV: bỏ dòng tên rỗng và loại trùng", async () => {
    const file = await xlsxFile([
      ["Tên", "Nhóm"],
      ["Nguyễn Văn An", "Nhà trai"],
      [null, "Nhà gái"],
      ["nguyễn  văn an", "Nhà gái"],
    ]);

    const result = await parseGuestFile(file);

    expect(result.rows).toEqual([{ name: "Nguyễn Văn An", group: "Nhà trai" }]);
    expect(result.skipped).toBe(1);
    expect(result.warnings.join(" ")).toMatch(/trùng/i);
  });

  it("chuyển ô số thành chữ thay vì bỏ trống", async () => {
    // Một cột "Nhóm" đánh số 1/2/3 là chuyện thường trong file thật.
    const file = await xlsxFile([
      ["Tên", "Nhóm"],
      ["Nguyễn Văn An", 2],
    ]);

    const result = await parseGuestFile(file);

    expect(result.rows).toEqual([{ name: "Nguyễn Văn An", group: "2" }]);
  });

  it("trả cảnh báo tiếng Việt cho file .xlsx hỏng thay vì ném lỗi", async () => {
    const broken = new File([new Uint8Array([1, 2, 3, 4])], "hong.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const result = await parseGuestFile(broken);

    expect(result.rows).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("hướng dẫn chuyển đổi khi gặp .xls đời cũ", async () => {
    const result = await parseGuestFile(new File(["x"], "khach.xls"));

    expect(result.rows).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/\.xlsx|\.csv/);
  });
});
