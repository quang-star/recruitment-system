import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CvDetails, CvDetailsEditor } from "./CvDetailsEditor";

function Harness() {
  const [value, setValue] = useState<CvDetails>({ education: [], languages: [], projects: [], certificates: [] });
  return <><CvDetailsEditor value={value} onChange={(patch) => setValue({ ...value, ...patch })} />
    <output data-testid="payload">{JSON.stringify(value)}</output></>;
}

describe("CvDetailsEditor", () => {
  it("keeps independent education, language, project and certificate edits", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Thêm học vấn"));
    fireEvent.change(screen.getByLabelText("Bằng cấp 1"), { target: { value: "BACHELOR" } });
    fireEvent.change(screen.getByLabelText("Chuyên ngành 1"), { target: { value: "Computer Science" } });
    fireEvent.click(screen.getByText("Thêm ngoại ngữ"));
    fireEvent.change(screen.getByLabelText("Trình độ 1"), { target: { value: "B2" } });
    fireEvent.click(screen.getByText("Thêm dự án"));
    fireEvent.change(screen.getByLabelText("Tên dự án 1"), { target: { value: "Portal" } });
    fireEvent.click(screen.getByText("Thêm chứng chỉ"));
    fireEvent.change(screen.getByLabelText("Tên chứng chỉ 1"), { target: { value: "AWS Certified Developer" } });
    const value = JSON.parse(screen.getByTestId("payload").textContent!);
    expect(value.education[0].degreeLevel).toBe("BACHELOR");
    expect(value.languages[0].proficiency).toBe("B2");
    expect(value.projects[0].name).toBe("Portal");
    expect(value.certificates[0].evidenceIds).toEqual([]);
    fireEvent.click(screen.getByText("Xóa ngoại ngữ 1"));
    expect(JSON.parse(screen.getByTestId("payload").textContent!).languages).toEqual([]);
  });
});
