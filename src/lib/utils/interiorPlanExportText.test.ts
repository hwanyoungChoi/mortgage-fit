// 스펙 interior-simple 표 머리(U8, AC-5)·이전 스펙 interior-planner AC-12 파일 이름 값 목록(태스크 5-2).
import { describe, expect, it } from "vitest";

import { makePlanQ } from "@/test/interiorPlanTableFixture";
import { makeSimplePlanP } from "@/test/interiorSimpleFixture";

import { interiorPlanExportFileName, interiorPlanTableHeading } from "./interiorPlanExportText";
import { summarizeInteriorPlan } from "./interiorPlanRows";

const TODAY = "2026-10-27";

describe("interiorPlanTableHeading (U8 표 머리)", () => {
  it("P: 제목 '우리 집 인테리어 계획', 줄 '2026-10-27 기준 · 총 예산 10,000,000원 · 지출 예정 8,000,000원 · 남은 예산 2,000,000원', 조각도 따로", () => {
    expect(
      interiorPlanTableHeading("우리 집", summarizeInteriorPlan(makeSimplePlanP()), TODAY),
    ).toEqual({
      title: "우리 집 인테리어 계획",
      basis: "2026-10-27 기준",
      budget: "총 예산 10,000,000원",
      plannedTotal: "지출 예정 8,000,000원",
      remaining: "남은 예산 2,000,000원",
      line: "2026-10-27 기준 · 총 예산 10,000,000원 · 지출 예정 8,000,000원 · 남은 예산 2,000,000원",
    });
  });

  it("총 예산 700(지출 예정 800 초과)이면 남은 예산 자리에 '예산 초과 1,000,000원'", () => {
    const summary = summarizeInteriorPlan(makeSimplePlanP({ budget: 700 }));
    expect(interiorPlanTableHeading("우리 집", summary, TODAY).line).toBe(
      "2026-10-27 기준 · 총 예산 7,000,000원 · 지출 예정 8,000,000원 · 예산 초과 1,000,000원",
    );
  });

  it("남은 예산이 정확히 0이면 '남은 예산 0원'(초과 아님)", () => {
    expect(
      interiorPlanTableHeading(
        "우리 집",
        { budget: 800, plannedTotal: 800, tbdCount: 0, remaining: 0 },
        TODAY,
      ).remaining,
    ).toBe("남은 예산 0원");
  });

  it("총 예산이 없으면(null) 총 예산·남은 예산 조각을 빼고 구분자가 어긋나지 않는다", () => {
    const heading = interiorPlanTableHeading(
      "우리 집",
      { budget: null, plannedTotal: 750, tbdCount: 0, remaining: null },
      TODAY,
    );
    expect(heading.budget).toBeUndefined();
    expect(heading.remaining).toBeUndefined();
    expect(heading.line).toBe("2026-10-27 기준 · 지출 예정 7,500,000원");
  });

  it("Q에서 총 예산을 지운 요약으로도 같은 줄", () => {
    const { budget: _budget, ...rest } = makePlanQ();
    void _budget;
    expect(interiorPlanTableHeading("우리 집", summarizeInteriorPlan(rest), TODAY).line).toBe(
      "2026-10-27 기준 · 지출 예정 7,500,000원",
    );
  });

  it("지출 예정 0이면 '지출 예정 0원'(조각이 빠지지 않음)", () => {
    expect(
      interiorPlanTableHeading(
        "우리 집",
        { budget: null, plannedTotal: 0, tbdCount: 0, remaining: null },
        TODAY,
      ).line,
    ).toBe("2026-10-27 기준 · 지출 예정 0원");
    expect(
      interiorPlanTableHeading(
        "우리 집",
        { budget: 0, plannedTotal: 0, tbdCount: 0, remaining: 0 },
        TODAY,
      ).line,
    ).toBe("2026-10-27 기준 · 총 예산 0원 · 지출 예정 0원 · 남은 예산 0원");
  });

  it("날짜는 받은 문자열 그대로(Date를 읽지 않음)", () => {
    expect(
      interiorPlanTableHeading(
        "집",
        { budget: null, plannedTotal: 1, tbdCount: 0, remaining: null },
        "1999-01-02",
      ).basis,
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
