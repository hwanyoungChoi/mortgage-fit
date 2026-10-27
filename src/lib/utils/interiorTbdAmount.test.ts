// 스펙 interior-tbd-amount 태스크 1-2(ADR-033 조건 4·5): 금액 미정 줄의 계산·문구·표 모델·CSV·표 머리·시트 입력·확정 토글.
// 계산은 `interiorPlanRows` 한 곳("확정이고 금액이 있는가")이고 표·CSV·표 머리·허브가 그 결과를 쓴다.
// 미정은 "금액 키 없음"뿐이다. 금액 0은 미정이 아니라 금액이다(ADR-033 개정 예정, 0원 견적).
import { describe, expect, it } from "vitest";

import {
  legacyY,
  makeSimplePlanP,
  makeSimplePlanPPlus,
  r6,
  r7,
  SIMPLE_P_PLUS_CSV_LINES,
  toCsvFile,
} from "@/test/interiorSimpleFixture";

import { buildInteriorPlanTable, tableAmountText } from "./buildInteriorPlanTable";
import { toInteriorLineDraft } from "./interiorLineDraft";
import { toggleLineConfirmInput } from "./interiorLineWrites";
import { interiorPlanTableHeading } from "./interiorPlanExportText";
import { buildInteriorPlanRows, summarizeInteriorPlan, tbdExclusionNote } from "./interiorPlanRows";
import { interiorPlanTableToCsvRows } from "./interiorPlanTableToCsvRows";
import { toCsv } from "./toCsv";

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

const confirmed = (item: InteriorItem): InteriorItem => ({
  ...item,
  confirmedQuoteId: item.quotes?.[0]?.id,
});

const unconfirmed = (item: InteriorItem): InteriorItem => {
  const { confirmedQuoteId, ...rest } = item;
  void confirmedQuoteId;
  return rest;
};

describe("buildInteriorPlanRows — 지출 예정·미정 건수", () => {
  it("P⁺: 묶음 [도배: R1, R2, R7] → [욕실: R3, R4, R5] → [조명: R6], 지출 예정 800, 확정 미정 R6만 1건", () => {
    const rows = buildInteriorPlanRows(makeSimplePlanPPlus());
    expect(rows.groups.map((group) => [group.trade, group.rows.map((row) => row.item.id)])).toEqual(
      [
        ["도배", ["r1", "r2", "r7"]],
        ["욕실", ["r3", "r4", "r5"]],
        ["조명", ["r6"]],
      ],
    );
    expect(rows.plannedTotalWon).toBe(8_000_000);
    expect(rows.tbdCount).toBe(1);
  });

  it("R7을 확정하면 미정 2건, 지출 예정 800 그대로", () => {
    const plan = makeSimplePlanPPlus();
    plan.items[6] = confirmed(r7());
    expect(buildInteriorPlanRows(plan)).toMatchObject({ plannedTotalWon: 8_000_000, tbdCount: 2 });
  });

  it("R6 확정을 끄면 미정 0건, 지출 예정 800 그대로", () => {
    const plan = makeSimplePlanPPlus();
    plan.items[5] = unconfirmed(r6());
    expect(buildInteriorPlanRows(plan)).toMatchObject({ plannedTotalWon: 8_000_000, tbdCount: 0 });
  });

  it("확정이 R6뿐이면 지출 예정 0, 미정 1건", () => {
    expect(buildInteriorPlanRows({ items: [r6(), r7()] })).toMatchObject({
      plannedTotalWon: 0,
      tbdCount: 1,
    });
  });

  it("확정한 금액 0 줄은 미정이 아니다(지출 예정 0, 미정 0건)", () => {
    expect(buildInteriorPlanRows({ items: [zeroAmountRow()] })).toMatchObject({
      plannedTotalWon: 0,
      tbdCount: 0,
    });
  });

  it("P(미정 없음)는 미정 0건", () => {
    expect(buildInteriorPlanRows(makeSimplePlanP()).tbdCount).toBe(0);
  });
});

describe("summarizeInteriorPlan — 남은 예산도 미정 줄을 더하지 않는다", () => {
  it.each([
    [1000, 2_000_000],
    [800, 0],
    [700, -1_000_000],
  ])("총 예산 %i만원 → 남은 예산 %i원, 미정 1건", (budget, remainingWon) => {
    expect(summarizeInteriorPlan(makeSimplePlanPPlus({ budget }))).toEqual({
      budgetWon: budget * 10_000,
      plannedTotalWon: 8_000_000,
      tbdCount: 1,
      remainingWon,
    });
  });
});

describe("tbdExclusionNote — 문구 함수 하나", () => {
  it.each([
    [0, ""],
    [1, "금액 미정 1건 제외"],
    [2, "금액 미정 2건 제외"],
    [10, "금액 미정 10건 제외"],
  ])("%i건 → '%s'", (count, note) => {
    expect(tbdExclusionNote(count)).toBe(note);
  });
});

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

  it("계 8,000,000 · 계 비고 '금액 미정 1건 제외', 미정 0건이면 비고 없음", () => {
    expect(tableOf(makeSimplePlanPPlus())).toMatchObject({
      confirmedTotal: 8_000_000,
      totalNote: "금액 미정 1건 제외",
    });
    expect(tableOf(makeSimplePlanP()).totalNote).toBe("");
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

describe("CSV — P⁺ (AC-3)", () => {
  it("정확히 9행, 계 비고 '금액 미정 1건 제외'", () => {
    expect(toCsv(interiorPlanTableToCsvRows(tableOf(makeSimplePlanPPlus())))).toBe(
      toCsvFile(SIMPLE_P_PLUS_CSV_LINES),
    );
    expect(SIMPLE_P_PLUS_CSV_LINES).toHaveLength(9);
  });

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

describe("표 머리 — 지출 예정 뒤에 '(금액 미정 n건 제외)'", () => {
  it("P⁺: 지출 예정 금액 바로 뒤에 붙는다", () => {
    const heading = interiorPlanTableHeading(
      "우리 집",
      summarizeInteriorPlan(makeSimplePlanPPlus()),
      "2026-10-27",
    );
    expect(heading.line).toBe(
      "2026-10-27 기준 · 총 예산 10,000,000원 · 지출 예정 8,000,000원(금액 미정 1건 제외) · 남은 예산 2,000,000원",
    );
  });
});

describe("시트 입력 — 미정·0원 채우기 (AC-2, 2단계)", () => {
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

  // 2단계는 원 입력이라 0원(셀프 시공)을 "0"으로 연다. 미정(빈칸)과 섞이지 않는다
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
