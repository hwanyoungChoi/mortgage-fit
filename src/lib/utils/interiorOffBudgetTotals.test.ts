// 스펙 interior-budget-exclude AC-3(계산, 예시 E·F·G), ADR-038: 예산 외 확정 줄은 지출 예정·지출 완료·남은 예산·묶음 합계·
// 금액 미정 건수에서 빠지고 `offBudgetTotalWon`에만 더해진다. 미확정 예산 외 줄은 어느 값에도 들어가지 않는다.
import { describe, expect, it } from "vitest";

import {
  makeOffBudgetPlanE,
  makeOffBudgetPlanF,
  makeOffBudgetPlanG,
  makeSimplePlanP,
  r1,
  r2,
  r3,
  r4,
  r5,
} from "@/test/interiorSimpleFixture";

import {
  buildInteriorPlanRows,
  groupConfirmedWonOf,
  summarizeInteriorPlan,
} from "./interiorPlanRows";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

/** E에서 R5만 반영으로 되돌린 계획(R3·R5 [완료]) */
const planEOnBudget = (overrides: Partial<InteriorPlanWithItems> = {}) =>
  makeSimplePlanP({
    items: [r1(), r2(), { ...r3(), status: "done" }, r4(), { ...r5(), status: "done" }],
    ...overrides,
  });

/** 묶음 이름 → 묶음 합계 */
const groupTotalsOf = (plan: InteriorPlanWithItems) =>
  Object.fromEntries(
    buildInteriorPlanRows(plan).groups.map((group) => [group.trade, groupConfirmedWonOf(group)]),
  );

describe("AC-3 예시 E: R3 [완료], R5 예산 외 + [완료]", () => {
  it("지출 예정 1,800,000 · 지출 완료 3,700,000 · 예산 외 2,500,000 · 남은 예산 4,500,000원", () => {
    expect(summarizeInteriorPlan(makeOffBudgetPlanE())).toStrictEqual({
      budgetWon: 10_000_000,
      plannedTotalWon: 1_800_000,
      doneTotalWon: 3_700_000,
      doneCount: 2,
      tbdCount: 0,
      offBudgetTotalWon: 2_500_000,
      offBudgetCount: 1,
      remainingWon: 4_500_000,
    });
  });

  it("R5를 반영으로 되돌리면 남은 예산 2,000,000원, 예산 외 0", () => {
    expect(summarizeInteriorPlan(planEOnBudget())).toMatchObject({
      doneTotalWon: 6_200_000,
      offBudgetTotalWon: 0,
      offBudgetCount: 0,
      remainingWon: 2_000_000,
    });
  });

  it("묶음 합계: 도배 1,800,000 · 욕실 3,700,000원(합 = 지출 예정 + 지출 완료)", () => {
    expect(groupTotalsOf(makeOffBudgetPlanE())).toStrictEqual({
      도배: 1_800_000,
      욕실: 3_700_000,
    });
  });

  it("경계: 총 예산 7,000,000원이면 R5 반영은 예산 초과 1,000,000원, R5 예산 외는 남은 예산 1,500,000원", () => {
    expect(summarizeInteriorPlan(planEOnBudget({ budgetWon: 7_000_000 })).remainingWon).toBe(
      -1_000_000,
    );
    expect(summarizeInteriorPlan(makeOffBudgetPlanE({ budgetWon: 7_000_000 })).remainingWon).toBe(
      1_500_000,
    );
  });

  it("줄의 isOffBudget은 R5에만 있다", () => {
    const offBudgetKeys = buildInteriorPlanRows(makeOffBudgetPlanE())
      .groups.flatMap((group) => group.rows)
      .filter((row) => row.isOffBudget)
      .map((row) => row.key);
    expect(offBudgetKeys).toStrictEqual(["r5:rq5"]);
  });
});

describe("AC-3 예시 F: 확정 미정 예산 외 R10, 미확정 예산 외 R11", () => {
  it("금액 미정은 R6 1건만, 예산 외는 R5만, R10·R11은 어느 합계에도 없다", () => {
    expect(summarizeInteriorPlan(makeOffBudgetPlanF())).toStrictEqual({
      budgetWon: 10_000_000,
      plannedTotalWon: 5_500_000,
      doneTotalWon: 0,
      doneCount: 0,
      tbdCount: 1,
      offBudgetTotalWon: 2_500_000,
      offBudgetCount: 1,
      remainingWon: 4_500_000,
    });
  });

  it("묶음 합계에도 R11(미확정 예산 외)·R10(확정 미정 예산 외)·R5(예산 외)가 없다", () => {
    expect(groupTotalsOf(makeOffBudgetPlanF())).toStrictEqual({
      도배: 1_800_000,
      욕실: 3_700_000,
      조명: null,
    });
  });

  it("미확정 R11도 줄 표시용 isOffBudget은 true다(U9)", () => {
    const r11Row = buildInteriorPlanRows(makeOffBudgetPlanF())
      .groups.flatMap((group) => group.rows)
      .find((row) => row.key === "r11:rq11");
    expect(r11Row).toMatchObject({ isConfirmed: false, isOffBudget: true });
  });
});

describe("예시 G: 예산 외 줄만 [완료]", () => {
  it("[완료] 줄은 1개지만 지출 완료 0원, 남은 예산은 예산 외 금액만큼 줄지 않는다", () => {
    expect(summarizeInteriorPlan(makeOffBudgetPlanG())).toMatchObject({
      plannedTotalWon: 5_500_000,
      doneTotalWon: 0,
      doneCount: 1,
      offBudgetTotalWon: 2_500_000,
      remainingWon: 4_500_000,
    });
  });
});
