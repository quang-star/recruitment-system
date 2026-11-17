import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createCvDocument } from "./cvDocument";
import { extractCvDocumentFromLines } from "./pdfExtract";
import { exportPdfWithOverlays } from "./pdfOverlayExport";

describe("pdfExtract & pdfOverlayExport", () => {
  it("extracts contacts, sections and entries cleanly from raw PDF text lines", () => {
    const lines = [
      "NGUYEN MINH AN",
      "Senior Backend Engineer",
      "minh.an@example.invalid | 0901234567 | Hà Nội | https://github.com/minhan",
      "MỤC TIÊU NGHỀ NGHIỆP",
      "Xây dựng hệ thống phân tán chịu tải cao.",
      "KỸ NĂNG",
      "Java, Spring Boot, PostgreSQL, Kafka",
      "KINH NGHIỆM LÀM VIỆC",
      "01/2023 - Hiện tại | Backend Engineer",
      "• Thiết kế API tuyển dụng xử lý 10k req/min",
      "HỌC VẤN",
      "09/2018 - 06/2022 | Đại học Bách Khoa",
      "GIẢI THƯỞNG",
      "Top 3 Hackathon Fintech 2023",
      "SỞ THÍCH",
      "Chạy bộ, đọc sách kiến trúc hệ thống",
    ];

    const doc = extractCvDocumentFromLines(lines, createCvDocument());
    expect(doc.fullName).toBe("NGUYEN MINH AN");
    expect(doc.headline).toBe("Senior Backend Engineer");
    expect(doc.email).toBe("minh.an@example.invalid");
    expect(doc.phone).toBe("0901234567");
    expect(doc.links).toContain("https://github.com/minhan");
    expect(doc.introduction).toContain("hệ thống phân tán");
    expect(doc.skills).toContain("Java, Spring Boot");
    expect(doc.experiences).toHaveLength(1);
    expect(doc.experiences[0].startMonth).toBe("2023-01");
    expect(doc.experiences[0].current).toBe(true);
    expect(doc.education).toHaveLength(1);
    expect(doc.awards).toHaveLength(1);
    expect(doc.hobbies).toHaveLength(1);
  });

  it("leaves extracted text empty when no text lines are present", () => {
    const empty = extractCvDocumentFromLines(["   ", ""], createCvDocument());
    expect(empty.fullName).toBe("");
    expect(empty.skills).toBe("");
    expect(empty.experiences).toEqual([]);
  });

  it("bakes whiteout patches onto real PDF bytes via pdf-lib", async () => {
    const basePdf = await PDFDocument.create();
    basePdf.addPage([595, 842]);
    const inputBytes = new Uint8Array(await basePdf.save());

    const editedBytes = await exportPdfWithOverlays(inputBytes, [
      {
        id: "w1",
        pageIndex: 0,
        kind: "whiteout",
        xPct: 10,
        yPct: 10,
        wPct: 25,
        hPct: 6,
        text: "",
        fontSizePt: 11,
        bold: false,
        color: "#0f172a",
        opaqueBg: true,
      },
    ]);

    expect(editedBytes.slice(0, 5)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]));
    const reloaded = await PDFDocument.load(editedBytes);
    expect(reloaded.getPageCount()).toBe(1);
  });
});
