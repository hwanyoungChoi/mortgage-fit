// 스펙 interior-tbd-amount 태스크 1-2(ADR-033 조건 4·5): 금액 미정 줄의 표 모델·CSV 칸·시트 입력·확정 토글.
// 미정은 "금액 키 없음"뿐이다. 금액 0은 미정이 아니라 금액이다(ADR-033 개정 예정, 0원 견적).
import { describe, expect, it } from "vitest";

import { legacyY, makeSimplePlanPPlus, r6, r7 } from "@/test/interiorSimpleFixture";

import { buildInteriorPlanTable, tableAmountText } from "./buildInteriorPlanTable";
import { toInteriorLineDraft } from "./interiorLineDraft";
import { toggleLineConfirmInput } from "./interiorLineWrites";
import { buildInteriorPlanRows } from "./interiorPlanRows";
import { interiorPlanTableToCsvRows } from "./interiorPlanTableToCsvRows";

import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const tableOf = (plan: Pick<InteriorPlanWithItems, "items">) =>
  buildInteriorPlanTable(buildInteriorPlanRows(plan));

/** 줄마다 [구분, 업체, 견적 칸, 확정 칸] */
const amountsOf = (plan: Pick<InteriorPlanWithItems, "items">) =>
  tableOf(plan).groups.flatMap((group) =>
    group.rows.map((row) => [group.trade, row.vendor, row.quoteWon, row.confirmedWon]),
  );

/** R6과 같은 줄에 금액 0 */
const zeroAmountRow = (): InteriorItem => {
  const item = r6();
  return { ...item, quotes: [{ id: "rq6", vendor: "빛나라조명", amount: 0 }] };
};

describe("buildInteriorPlanTable — 견적 없음 / 미정 / 금액 3분류", () => {
  it("P⁺: R7 견적 칸 미정·확정 칸 빈칸, R6 두 칸 모두 미정", () => {
    expect(amountsOf(makeSimplePlanPPlus())).toEqual([
      ["도배", "육문수", 1_800_000, 1_800_000],
      ["도배", "동네도배", 1_500_000, undefined],
      ["도배", "한솔도배", "tbd", undefined],
      ["욕실", "하루바스", 3_700_000, 3_700_000],
      ["욕실", "욕실나라", 4_000_000, undefined],
      ["욕실", "하루바스", 2_500_000, 2_500_000],
      ["조명", "빛나라조명", "tbd", "tbd"],
    ]);
  });

  it("빈 줄(L의 Y, 견적 0개)은 빈칸, 같은 계획의 R7(견적 1개, 금액 없음)은 미정", () => {
    expect(amountsOf({ items: [legacyY(), r7()] })).toEqual([
      ["도배", "", undefined, undefined],
      ["도배", "한솔도배", "tbd", undefined],
    ]);
  });

  it("금액 0은 미정이 아니라 금액 0이다", () => {
    expect(amountsOf({ items: [zeroAmountRow()] })).toEqual([["조명", "빛나라조명", 0, 0]]);
  });
});

describe("tableAmountText — 화면·CSV 공통 칸 글자", () => {
  it.each<[Parameters<typeof tableAmountText>[0], string]>([
    [undefined, ""],
    ["tbd", "미정"],
    [0, "0"],
    [1_800_000, "1800000"],
  ])("%j → '%s'", (amount, text) => {
    expect(tableAmountText(amount, String)).toBe(text);
  });
});

describe("CSV — 미정 칸", () => {
  it("R7 `도배,한솔도배,,미정,,`, R6 `조명,빛나라조명,거실 매입등,미정,미정,`, 미정 줄에 0 없음", () => {
    const rows = interiorPlanTableToCsvRows(tableOf(makeSimplePlanPPlus()));
    const tbdRows = rows.filter((row) => row[1] === "한솔도배" || row[1] === "빛나라조명");
    expect(tbdRows).toEqual([
      ["도배", "한솔도배", "", "미정", "", ""],
      ["조명", "빛나라조명", "거실 매입등", "미정", "미정", ""],
    ]);
    expect(tbdRows.flat()).not.toContain("0");
  });
});

describe("시트 입력 — 1단계 (AC-2 1단계)", () => {
  const rowOf = (plan: Pick<InteriorPlanWithItems, "items">, key: string) => {
    const row = buildInteriorPlanRows(plan)
      .groups.flatMap((group) => group.rows)
      .find((candidate) => candidate.key === key);
    if (row === undefined) throw new Error(`줄 없음: ${key}`);
    return row;
  };

  it("R6 시트를 열면 견적 칸은 빈칸('undefined'·'NaN'·'0' 아님)", () => {
    expect(toInteriorLineDraft(rowOf(makeSimplePlanPPlus(), "r6:rq6"))).toStrictEqual({
      trade: "조명",
      vendor: "빛나라조명",
      amount: "",
      detail: "거실 매입등",
      note: "",
      isConfirmed: true,
    });
  });

  it("금액 0인 줄은 견적 칸 '0'", () => {
    expect(toInteriorLineDraft(rowOf({ items: [zeroAmountRow()] }, "r6:rq6")).amount).toBe("0");
  });
});

describe("확정 토글 — 미정 견적 보존", () => {
  it("R6 확정 끄기: confirmedQuoteId 키만 빠지고 견적에 amount 키가 계속 없다", () => {
    const input = toggleLineConfirmInput(r6(), "rq6", false);
    expect(input).toStrictEqual({
      spaceId: "sp-whole",
      trade: "조명",
      quotes: [{ id: "rq6", vendor: "빛나라조명", memo: "거실 매입등" }],
      status: "planned",
    });
    expect(Object.hasOwn(input.quotes?.[0] ?? {}, "amount")).toBe(false);
  });

  it("R7 확정 켜기: confirmedQuoteId만 더한다", () => {
    expect(toggleLineConfirmInput(r7(), "rq7", true)).toStrictEqual({
      spaceId: "sp-whole",
      trade: "도배",
      quotes: [{ id: "rq7", vendor: "한솔도배" }],
      confirmedQuoteId: "rq7",
      status: "planned",
    });
  });
});
