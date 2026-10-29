// ADR-034 조건 2·8·9(qa Q1·Q3·Q4·Q5): 금액을 원으로 읽는 곳(`quoteWonOf`·`planBudgetWonOf`)과 그 결과를 쓰는
// 요약·표·표 머리·CSV가 예시 M에서 같은 숫자인지. 0은 금액이 정해진 0이라 미정과 다르다(truthy 판정이면 걸린다).
// 화면(목록·요약·표·허브·가리기)은 MortgageHome.wonUnit.test.tsx·MortgageHub.wonUnit.test.tsx가 본다.
import { describe, expect, it } from "vitest";

import { MAX_WON } from "@/lib/constants/interiorPlan";
import { makePlanM, PLAN_M_CSV_LINES, simpleTime } from "@/test/interiorSimpleFixture";

import { formatThousands, formatWon } from "./amount";
import { buildInteriorPlanTable } from "./buildInteriorPlanTable";
import { interiorPlanTableHeading } from "./interiorPlanExportText";
import {
  buildInteriorPlanRows,
  planBudgetWonOf,
  quoteWonOf,
  summarizeInteriorPlan,
} from "./interiorPlanRows";
import { interiorPlanTableToCsvRows } from "./interiorPlanTableToCsvRows";

import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const csvLinesOf = (plan: InteriorPlanWithItems) =>
  interiorPlanTableToCsvRows(buildInteriorPlanTable(buildInteriorPlanRows(plan))).map((row) =>
    row.join(","),
  );

/** M에서 총 예산 키만 바꾼다(옛 `budget`을 지우고 받은 키를 넣는다) */
const planMWith = (budgets: Pick<InteriorPlanWithItems, "budget" | "budgetWon">) => {
  const { budget, ...rest } = makePlanM();
  void budget;
  return { ...rest, ...budgets };
};

describe("quoteWonOf — 견적 금액(원)", () => {
  it.each([
    ["{ amount: 800 }(만원)", { amount: 800 }, 8_000_000],
    ["{ amountWon: 1234500 }", { amountWon: 1_234_500 }, 1_234_500],
    ["{ amountWon: 1 }", { amountWon: 1 }, 1],
    ["{ amountWon: 0 }", { amountWon: 0 }, 0],
    ["{ amount: 0 }(8e30cdd의 0원)", { amount: 0 }, 0],
    ["{ amountWon: MAX_WON }", { amountWon: MAX_WON }, MAX_WON],
    ["{ amount: 999999999 }", { amount: 999_999_999 }, 9_999_999_990_000],
    ["{}(미정)", {}, undefined],
  ])("%s → %s", (_, quote, won) => {
    expect(quoteWonOf(quote)).toBe(won);
  });
});

describe("planBudgetWonOf — 총 예산(원)", () => {
  it.each([
    ["{ budget: 1000 }(만원)", { budget: 1000 }, 10_000_000],
    ["{ budgetWon: 12000000 }", { budgetWon: 12_000_000 }, 12_000_000],
    ["{ budgetWon: 1 }", { budgetWon: 1 }, 1],
    ["{}(없음)", {}, undefined],
  ])("%s → %s", (_, plan, won) => {
    expect(planBudgetWonOf(plan)).toBe(won);
  });
});

describe("formatWon — 목록·요약·허브·표 머리·비고의 글자", () => {
  it.each([
    [0, "0원"],
    [999, "999원"],
    [1_234_500, "1,234,500원"],
    [MAX_WON, "9,999,999,999,999원"],
  ])("%i → %s", (won, text) => {
    expect(formatWon(won)).toBe(text);
  });
});

describe("예시 M(ADR-034 조건 8): 요약·표·표 머리·CSV가 같은 숫자", () => {
  it("총 예산 { budget: 1000 }: 지출 예정 10,469,500원 · 예산 초과 469,500원 · 미정 1건", () => {
    const plan = makePlanM();
    expect(summarizeInteriorPlan(plan)).toStrictEqual({
      budgetWon: 10_000_000,
      plannedTotalWon: 10_469_500,
      doneTotalWon: 0,
      doneCount: 0,
      tbdCount: 1,
      remainingWon: -469_500,
    });
    const table = buildInteriorPlanTable(buildInteriorPlanRows(plan));
    expect(table.confirmedTotal).toBe(10_469_500);
    expect(table.groups.flatMap((group) => group.rows.map((row) => row.quoteWon))).toEqual([
      8_000_000,
      1_234_500,
      1_235_000,
      999,
      "tbd",
    ]);
    expect(
      interiorPlanTableHeading(plan.name, summarizeInteriorPlan(plan), "2026-10-27").line,
    ).toBe(
      "2026-10-27 기준 · 총 예산 10,000,000원 · 지출 예정 10,469,500원(금액 미정 1건 제외) · 예산 초과 469,500원",
    );
    expect(csvLinesOf(plan)).toEqual(PLAN_M_CSV_LINES);
  });

  it("총 예산 { budgetWon: 12000000 }: 남은 예산 1,530,500원, 지출 예정·CSV는 그대로", () => {
    const plan = planMWith({ budgetWon: 12_000_000 });
    expect(summarizeInteriorPlan(plan)).toStrictEqual({
      budgetWon: 12_000_000,
      plannedTotalWon: 10_469_500,
      doneTotalWon: 0,
      doneCount: 0,
      tbdCount: 1,
      remainingWon: 1_530_500,
    });
    expect(
      interiorPlanTableHeading(plan.name, summarizeInteriorPlan(plan), "2026-10-27").line,
    ).toBe(
      "2026-10-27 기준 · 총 예산 12,000,000원 · 지출 예정 10,469,500원(금액 미정 1건 제외) · 남은 예산 1,530,500원",
    );
    expect(csvLinesOf(plan)).toEqual(PLAN_M_CSV_LINES);
  });

  it("읽기는 저장 형태를 바꾸지 않는다(계산 뒤에도 M 그대로)", () => {
    const plan = makePlanM();
    summarizeInteriorPlan(plan);
    buildInteriorPlanTable(buildInteriorPlanRows(plan));
    expect(plan).toStrictEqual(makePlanM());
  });
});

describe("0원과 미정(qa Q1·Q10)", () => {
  const row = (id: string, quote: { amount?: number; amountWon?: number }): InteriorItem => ({
    id,
    spaceId: "sp-whole",
    trade: "도배",
    quotes: [{ id: `${id}-q`, vendor: id, ...quote }],
    confirmedQuoteId: `${id}-q`,
    status: "planned",
    createdAt: simpleTime(1),
    updatedAt: simpleTime(1),
  });

  it("확정 { amountWon: 0 }·{ amount: 0 }은 지출 예정에 0을 더하고 미정으로 세지 않는다. 총 예산 1원이면 남은 1원", () => {
    const plan = planMWith({ budgetWon: 1 });
    const zeroPlan = { ...plan, items: [row("a", { amountWon: 0 }), row("b", { amount: 0 })] };
    expect(summarizeInteriorPlan(zeroPlan)).toStrictEqual({
      budgetWon: 1,
      plannedTotalWon: 0,
      doneTotalWon: 0,
      doneCount: 0,
      tbdCount: 0,
      remainingWon: 1,
    });
    expect(csvLinesOf(zeroPlan).slice(1)).toEqual(["도배,a,,0,0,", "도배,b,,0,0,", "계,,,,0,"]);
  });

  it.each([
    [9_234_500, 0],
    [9_234_499, -1],
  ])(
    "확정 합계 9,234,500원, 총 예산 %i원 → 남은 %i원(0은 초과 아님)",
    (budgetWon, remainingWon) => {
      const plan = {
        ...planMWith({ budgetWon }),
        items: [row("a", { amount: 800 }), row("b", { amountWon: 1_234_500 })],
      };
      expect(summarizeInteriorPlan(plan).remainingWon).toBe(remainingWon);
    },
  );
});

describe("상한 합계(qa Q5): 정수 오차·지수 표기 없음", () => {
  it("항목 100개 × 확정 MAX_WON → 지출 예정 999,999,999,999,900원, 총 예산 MAX_WON이면 남은 −989,999,999,999,901원", () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      id: `max${index}`,
      spaceId: "sp-whole",
      trade: "도배",
      quotes: [{ id: `max${index}-q`, vendor: "업체", amountWon: MAX_WON }],
      confirmedQuoteId: `max${index}-q`,
      status: "planned" as const,
      createdAt: simpleTime(1),
      updatedAt: simpleTime(1),
    }));
    const plan = { ...planMWith({ budgetWon: MAX_WON }), items };
    const summary = summarizeInteriorPlan(plan);
    expect(summary.plannedTotalWon).toBe(999_999_999_999_900);
    expect(summary.remainingWon).toBe(-989_999_999_999_901);
    expect(Number.isSafeInteger(summary.plannedTotalWon)).toBe(true);
    expect(Number.isSafeInteger(summary.remainingWon)).toBe(true);
    expect(formatWon(summary.plannedTotalWon)).toBe("999,999,999,999,900원");
    expect(formatThousands(-summary.remainingWon!)).toBe("989,999,999,999,901");
    expect(csvLinesOf(plan).at(-1)).toBe("계,,,,999999999999900,");
  });
});
