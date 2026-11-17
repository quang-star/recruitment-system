import { describe, expect, it } from "vitest";
import {
  applyRichFormatToText,
  parseInlineRuns,
  parseRichTextLines,
} from "./cvRichText";

describe("cvRichText", () => {
  it("parses inline **bold** and *italic* tokens safely without HTML evaluation", () => {
    expect(parseInlineRuns("")).toEqual([{ text: "", bold: false, italic: false }]);
    expect(parseInlineRuns("Tối ưu **API Java** giảm *40% latency*")).toEqual([
      { text: "Tối ưu ", bold: false, italic: false },
      { text: "API Java", bold: true, italic: false },
      { text: " giảm ", bold: false, italic: false },
      { text: "40% latency", bold: false, italic: true },
    ]);
  });

  it("parses bullet and paragraph lines cleanly", () => {
    const lines = parseRichTextLines("• Dẫn dắt **nhóm 5 người**\n- Thiết kế *microservice*\nĐạt SLA 99.9%");
    expect(lines).toEqual([
      {
        isBullet: true,
        runs: [
          { text: "Dẫn dắt ", bold: false, italic: false },
          { text: "nhóm 5 người", bold: true, italic: false },
        ],
      },
      {
        isBullet: true,
        runs: [
          { text: "Thiết kế ", bold: false, italic: false },
          { text: "microservice", bold: false, italic: true },
        ],
      },
      {
        isBullet: false,
        runs: [{ text: "Đạt SLA 99.9%", bold: false, italic: false }],
      },
    ]);
  });

  it("toggles bold, italic and bullet formatting on selections", () => {
    const bolded = applyRichFormatToText("Xây dựng hệ thống", 4, 8, "bold");
    expect(bolded.nextValue).toBe("Xây **dựng** hệ thống");
    const unbolded = applyRichFormatToText(bolded.nextValue, bolded.nextStart, bolded.nextEnd, "bold");
    expect(unbolded.nextValue).toBe("Xây dựng hệ thống");

    const italicized = applyRichFormatToText("", 0, 0, "italic");
    expect(italicized.nextValue).toBe("*ghi chú*");

    const bulleted = applyRichFormatToText("Dòng 1\nDòng 2", 0, 12, "bullet");
    expect(bulleted.nextValue).toBe("• Dòng 1\n• Dòng 2");
    const unbulleted = applyRichFormatToText(bulleted.nextValue, 0, bulleted.nextValue.length, "bullet");
    expect(unbulleted.nextValue).toBe("Dòng 1\nDòng 2");
  });
});
