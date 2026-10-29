// 구매 완료(항목 `status` "done"): 쓰기 입력, 합계, 표·CSV의 완료 열. 화면은 MortgageHome.done.test.tsx.
import { describe, expect, it } from "vitest";

import { makeSimplePlanP, r1, r4 } from "@/test/interiorSimpleFixture";

import { buildInteriorPlanTable } from "./buildInteriorPlanTable";
import { toggleLineConfirmInput, toggleLineDoneInput } from "./interiorLineWrites";
import { interiorPlanTableHeading } from "./interiorPlanExportText";
import { buildInteriorPlanRows, summarizeInteriorPlan } from "./interiorPlanRows";
import { interiorPlanTableToCsvRows } from "./interiorPlanTableToCsvRows";

const done = <T extends object>(item: T) => ({ ...item, status: "done" as const });

describe("toggleLineDoneInput", () => {
  it("켜면 그 견적을 확정하고 done, 끄면 확정은 두고 planned", () => {
    expect(toggleLineDoneInput(r4(), "rq4", true)).toMatchObject({
      confirmedQuoteId: "rq4",
      status: "done",
    });
    const off = toggleLineDoneInput(done(r1()), "rq1", false);
    expect(off).toMatchObject({ confirmedQuoteId: "rq1", status: "planned" });
  });

  it("[확정]을 끄면 완료도 풀린다", () => {
    expect(toggleLineConfirmInput(done(r1()), "rq1", false).status).toBe("planned");
  });
});

describe("지출 완료 합계", () => {
  it("완료 줄은 지출 예정에서 빠지고 지출 완료로, 남은 예산 = 총 예산 − 둘", () => {
    const plan = makeSimplePlanP();
    plan.items[0] = done(plan.items[0]);
    expect(summarizeInteriorPlan(plan)).toMatchObject({
      plannedTotalWon: 6_200_000,
      doneTotalWon: 1_800_000,
      doneCount: 1,
      remainingWon: 2_000_000,
    });
  });

  it("확정이 아닌 줄은 status가 done이어도 완료가 아니다", () => {
    const plan = makeSimplePlanP({ items: [done(r4())] });
    expect(buildInteriorPlanRows(plan).doneCount).toBe(0);
  });

  it("완료 줄이 있으면 표·CSV에 완료(원) 열이 생기고 표 머리에 지출 완료", () => {
    const plan = makeSimplePlanP();
    plan.items[0] = done(plan.items[0]);
    const table = buildInteriorPlanTable(buildInteriorPlanRows(plan));
    const csv = interiorPlanTableToCsvRows(table);
    expect(csv[0]).toEqual([
      "구분",
      "업체",
      "세부내용",
      "견적(원)",
      "확정(원)",
      "완료(원)",
      "비고",
    ]);
    expect(csv[1]).toEqual(["도배", "육문수", "실크 전체", "1800000", "1800000", "1800000", ""]);
    expect(csv.at(-1)).toEqual(["계", "", "", "", "8000000", "1800000", ""]);
    expect(
      interiorPlanTableHeading("우리 집", summarizeInteriorPlan(plan), "2026-10-29").line,
    ).toBe(
      "2026-10-29 기준 · 총 예산 10,000,000원 · 지출 예정 6,200,000원 · 지출 완료 1,800,000원 · 남은 예산 2,000,000원",
    );
  });
});
