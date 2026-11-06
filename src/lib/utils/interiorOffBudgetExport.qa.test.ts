// 스펙 interior-budget-exclude AC-6 경계(qa): "예산 외 n원"은 예산 외 확정 금액 줄이 있을 때만(offBudgetCount > 0) 표 머리·계 비고에
// 나오고, 미확정·확정 미정 예산 외 줄은 줄 비고 "예산 외"만 남긴다(U9). 총 예산 없음·예산 초과에서도 조각 순서가 같다.
import { describe, expect, it } from "vitest";

import {
  makeOffBudgetPlanE,
  makeSimplePlanP,
  r1,
  r10,
  r2,
  r3,
  r4,
  r5,
} from "@/test/interiorSimpleFixture";

import { buildInteriorPlanTable } from "./buildInteriorPlanTable";
import { interiorPlanTableHeading } from "./interiorPlanExportText";
import { buildInteriorPlanRows, summarizeInteriorPlan } from "./interiorPlanRows";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const TODAY = "2026-11-06";

const exportOf = (plan: InteriorPlanWithItems) => {
  const table = buildInteriorPlanTable(buildInteriorPlanRows(plan));
  return {
    totalNote: table.totalNote,
    notes: table.groups.flatMap((group) => group.rows.map((row) => row.note)),
    heading: interiorPlanTableHeading(plan.name, summarizeInteriorPlan(plan), TODAY).line,
  };
};

describe("AC-6 경계: 예산 외 확정 금액 줄이 없으면 '예산 외 n원'을 그리지 않는다", () => {
  it.each([
    [
      "미확정 예산 외 줄만(R2)",
      [r1(), { ...r2(), isOffBudget: true as const }, r3(), r4(), r5()],
      1,
    ],
    ["확정 미정 예산 외 줄만(R10)", [r1(), r2(), r3(), r4(), r5(), r10()], 5],
  ])("%s: 줄 비고는 '예산 외', 계 비고·표 머리에는 없다", (_, items, offBudgetIndex) => {
    const { totalNote, notes, heading } = exportOf(makeSimplePlanP({ items }));
    expect(notes[offBudgetIndex]).toBe("예산 외");
    expect(totalNote).toBe("");
    expect(heading).not.toContain("예산 외");
  });
});

describe("AC-6 경계: 표 머리 조각 순서", () => {
  it("총 예산 없음: 지출 예정 · 지출 완료 · 예산 외(남은 예산 없음)", () => {
    expect(exportOf(makeOffBudgetPlanE({ budget: undefined })).heading).toBe(
      "2026-11-06 기준 · 지출 예정 1,800,000원 · 지출 완료 3,700,000원 · 예산 외 2,500,000원",
    );
  });

  it("예산 초과(총 예산 500만원, 반영분 550만원): 예산 외 조각 뒤에 '예산 초과 500,000원'", () => {
    expect(exportOf(makeOffBudgetPlanE({ budget: 500 })).heading).toBe(
      "2026-11-06 기준 · 총 예산 5,000,000원 · 지출 예정 1,800,000원 · 지출 완료 3,700,000원 · 예산 외 2,500,000원 · 예산 초과 500,000원",
    );
  });
});

it("AC-6 경계: 항목 메모가 있는 예산 외 줄의 비고는 '메모 · 예산 외'", () => {
  const items = [
    r1(),
    r2(),
    r3(),
    r4(),
    { ...r5(), memo: "부모님 지원", isOffBudget: true as const },
  ];
  expect(exportOf(makeSimplePlanP({ items })).notes[4]).toBe("부모님 지원 · 예산 외");
});
