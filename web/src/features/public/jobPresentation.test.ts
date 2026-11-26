import { expect, it } from "vitest";
import { extractSkillsFromJob } from "./jobPresentation";

it("only displays skills mentioned in the job text", () => {
  expect(extractSkillsFromJob("Chăm sóc khách hàng", "Hỗ trợ khách hàng", "Nhân viên tư vấn")).toEqual([]);
  expect(extractSkillsFromJob("JavaScript và React", "", "")).toEqual(["React", "JavaScript"]);
  expect(extractSkillsFromJob(null, null, null)).toEqual([]);
});

it.each(["Go\u0301i phúc lợi", "goût armée", "Javađ Reacté"])(
  "does not extract skills from within Unicode words: %s",
  (text) => {
    expect(extractSkillsFromJob(text)).toEqual([]);
  }
);

it("does not assemble multiword skills across separate job fields", () => {
  expect(extractSkillsFromJob("Spring", "Boot", "")).toEqual([]);
  expect(extractSkillsFromJob("", "Event", "Sourcing")).toEqual([]);
  expect(extractSkillsFromJob(null, "Spring Boot", "Event Sourcing")).toEqual(["Spring Boot", "Event Sourcing"]);
});

it("preserves literal punctuation and token boundaries", () => {
  expect(extractSkillsFromJob("JavaScript TypeScript Java# Go_ NextXjs C/C++")).toEqual([
    "TypeScript", "JavaScript", "C/C++"
  ]);
  expect(extractSkillsFromJob("Next.js và C/C++")).toEqual(["Next.js", "C/C++"]);
  expect(extractSkillsFromJob("React+TypeScript")).toEqual(["React", "TypeScript"]);
});

it("preserves candidate ordering and the five-skill limit", () => {
  expect(extractSkillsFromJob("JavaScript TypeScript Next.js React Spring Boot Java")).toEqual([
    "Java", "Spring Boot", "React", "Next.js", "TypeScript"
  ]);
});

it("extracts extended IT stack skills including .NET, C#, Angular, Vue.js, Kotlin, Playwright, and Flutter", () => {
  expect(extractSkillsFromJob("ASP.NET Core, .NET, C#, Angular, Vue.js")).toEqual([
    "Vue.js", "Angular", "ASP.NET Core", ".NET", "C#"
  ]);
  expect(extractSkillsFromJob("ASP.NET Core and C#")).toEqual([
    "ASP.NET Core", "C#"
  ]);
  expect(extractSkillsFromJob("Kotlin, Flutter, Playwright")).toEqual([
    "Kotlin", "Flutter", "Playwright"
  ]);
});
