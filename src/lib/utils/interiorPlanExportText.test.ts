// 스펙 interior-planner "표 내보내기" 표 머리·파일 이름, AC-11 표 머리 문자열, AC-12 파일 이름 값 목록(태스크 5-2).
import { describe, expect, it } from "vitest";

import { makePlanQ } from "@/test/interiorPlanTableFixture";

import { interiorPlanExportFileName, interiorPlanTableHeading } from "./interiorPlanExportText";
import { summarizeInteriorPlan } from "./summarizeInteriorPlan";

const TODAY = "2026-10-27";

describe("interiorPlanTableHeading (AC-11 표 머리)", () => {
  it("Q: 제목 '우리 집 인테리어 계획', 줄 '2026-10-27 기준 · 총 예산 15,000,000원 · 예상 총액 11,500,000원', 조각도 따로", () => {
    const summary = summarizeInteriorPlan(makePlanQ(), new Date(2026, 9, 27, 12, 0, 0));
    expect(interiorPlanTableHeading("우리 집", summary, TODAY)).toEqual({
      title: "우리 집 인테리어 계획",
      basis: "2026-10-27 기준",
      budget: "총 예산 15,000,000원",
      expectedTotal: "예상 총액 11,500,000원",
      line: "2026-10-27 기준 · 총 예산 15,000,000원 · 예상 총액 11,500,000원",
    });
  });

  it("총 예산이 없으면(null) 그 조각을 빼고 구분자가 어긋나지 않는다", () => {
    const heading = interiorPlanTableHeading(
      "우리 집",
      { budget: null, expectedTotal: 1150 },
      TODAY,
    );
    expect(heading.budget).toBeUndefined();
    expect(heading.line).toBe("2026-10-27 기준 · 예상 총액 11,500,000원");
  });

  it("Q에서 총 예산을 지운 요약으로도 같은 줄", () => {
    const { budget: _budget, ...rest } = makePlanQ();
    void _budget;
    const summary = summarizeInteriorPlan(rest, new Date(2026, 9, 27, 12, 0, 0));
    expect(interiorPlanTableHeading("우리 집", summary, TODAY).line).toBe(
      "2026-10-27 기준 · 예상 총액 11,500,000원",
    );
  });

  it("예상 총액 0이면 '예상 총액 0원'(조각이 빠지지 않음)", () => {
    expect(
      interiorPlanTableHeading("우리 집", { budget: null, expectedTotal: 0 }, TODAY).line,
    ).toBe("2026-10-27 기준 · 예상 총액 0원");
    expect(interiorPlanTableHeading("우리 집", { budget: 0, expectedTotal: 0 }, TODAY).line).toBe(
      "2026-10-27 기준 · 총 예산 0원 · 예상 총액 0원",
    );
  });

  it("날짜는 받은 문자열 그대로(Date를 읽지 않음)", () => {
    expect(
      interiorPlanTableHeading("집", { budget: null, expectedTotal: 1 }, "1999-01-02").basis,
    ).toBe("1999-01-02 기준");
  });
});

describe("interiorPlanExportFileName (AC-12 파일 이름 값 목록, 기준일 2026-10-27)", () => {
  it.each([
    ["우리 집", "우리 집-인테리어-2026-10-27.csv"],
    ["a/b:c?", "a_b_c_-인테리어-2026-10-27.csv"],
    ['a\\b/c:d*e?f"g<h>i|j', "a_b_c_d_e_f_g_h_i_j-인테리어-2026-10-27.csv"],
    ["///", "___-인테리어-2026-10-27.csv"],
    [".", "인테리어-2026-10-27.csv"],
    ["...", "인테리어-2026-10-27.csv"],
    [" . ", "인테리어-2026-10-27.csv"],
    ["", "인테리어-2026-10-27.csv"],
    [".숨김.", "숨김-인테리어-2026-10-27.csv"],
    ["  우리 집  ", "우리 집-인테리어-2026-10-27.csv"],
    ["_우리_", "_우리_-인테리어-2026-10-27.csv"],
    ["a\tb", "a_b-인테리어-2026-10-27.csv"],
    ["a\nb", "a_b-인테리어-2026-10-27.csv"],
    ["a\u0000b", "a_b-인테리어-2026-10-27.csv"],
    ["a\u001fb", "a_b-인테리어-2026-10-27.csv"],
    ["a\u007fb", "a_b-인테리어-2026-10-27.csv"],
    // 연속해도 합치지 않는다
    ["a//b", "a__b-인테리어-2026-10-27.csv"],
    // 치환이 먼저: 앞의 탭은 `_`가 되어 남는다(공백이 아니라 떼지 않음)
    ["\t집", "_집-인테리어-2026-10-27.csv"],
    // U+0080 이상(이모지·양방향 제어 문자)은 그대로
    ["집🏠", "집🏠-인테리어-2026-10-27.csv"],
    ["a‮b", "a‮b-인테리어-2026-10-27.csv"],
    ["a\u0080b", "a\u0080b-인테리어-2026-10-27.csv"],
  ])("%j → %j", (name, fileName) => {
    expect(interiorPlanExportFileName(name, "2026-10-27")).toBe(fileName);
  });

  it("한글 40자는 자르지 않는다", () => {
    const name = "가".repeat(40);
    expect(interiorPlanExportFileName(name, "2026-10-27")).toBe(`${name}-인테리어-2026-10-27.csv`);
  });
});
