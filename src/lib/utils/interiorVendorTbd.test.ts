// 스펙 interior-vendor-tbd-line-order 태스크 1-2(ADR-036 조건 8, AC-1): 업체 미정(견적 `vendor` 키 없음)의 판단·표 모델·CSV·
// 시트 채우기와 1단계 쓰기 보존(코드 변경 없이 테스트만). 예시 V = P⁺ + R8(조명·업체 미정·거실 간접등·300,000원 ✓) + R9(철거·`{ id }`).
// 리터럴은 스펙 문자열 그대로이고 상수에서 가져오지 않는다.
import { describe, expect, it } from "vitest";

import {
  legacyY,
  makeFullItem,
  makePlanV,
  makeSimplePlanP,
  r8,
  r9,
} from "@/test/interiorSimpleFixture";

import { buildInteriorPlanTable, tableVendorText } from "./buildInteriorPlanTable";
import { interiorLineDraftErrors, toInteriorLineDraft } from "./interiorLineDraft";
import { editLineInput, removeLineWrite, toggleLineConfirmInput } from "./interiorLineWrites";
import { buildInteriorPlanRows, summarizeInteriorPlan, vendorOf } from "./interiorPlanRows";
import { interiorPlanTableToCsvRows } from "./interiorPlanTableToCsvRows";

import type { InteriorLineValues } from "@/lib/types/interiorLineDraft";
import type { InteriorItem, InteriorPlanWithItems, InteriorQuote } from "@/lib/types/interiorPlan";

const rowsOf = (plan: Pick<InteriorPlanWithItems, "items">) =>
  buildInteriorPlanRows(plan).groups.flatMap((group) => group.rows);

const rowOf = (plan: Pick<InteriorPlanWithItems, "items">, key: string) => {
  const row = rowsOf(plan).find((candidate) => candidate.key === key);
  if (row === undefined) throw new Error(`줄 없음: ${key}`);
  return row;
};

const tableRowsOf = (plan: Pick<InteriorPlanWithItems, "items">) =>
  buildInteriorPlanTable(buildInteriorPlanRows(plan)).groups.flatMap((group) => group.rows);

/** 견적 하나짜리 항목(업체 칸 단위 테스트용) */
const quoteItem = (id: string, quote: InteriorQuote): InteriorItem => ({
  id,
  spaceId: "sp-whole",
  trade: "조명",
  quotes: [quote],
  status: "planned",
  createdAt: "2026-10-27T00:00:00.000Z",
  updatedAt: "2026-10-27T00:00:00.000Z",
});

describe("vendorOf — 업체 있음/없음 판단 한 곳", () => {
  it("업체 키 없음 → null(업체 미정)", () => {
    expect(vendorOf({})).toBeNull();
    expect(vendorOf(r9().quotes?.[0] ?? { id: "x", vendor: "x" })).toBeNull();
  });

  it("업체 이름 → 그대로(글자 '미정'·'tbd'도 이름이다)", () => {
    expect(vendorOf({ vendor: "육문수" })).toBe("육문수");
    expect(vendorOf({ vendor: "미정" })).toBe("미정");
    expect(vendorOf({ vendor: "tbd" })).toBe("tbd");
  });
});

describe("예시 V — 목록 묶음·요약 (AC-1)", () => {
  it("묶음은 [도배: R1, R2, R7] → [욕실: R3, R4, R5] → [조명: R6, R8] → [철거: R9]", () => {
    expect(
      buildInteriorPlanRows(makePlanV()).groups.map((group) => [
        group.trade,
        group.rows.map((row) => row.key),
      ]),
    ).toStrictEqual([
      ["도배", ["r1:rq1", "r2:rq2", "r7:rq7"]],
      ["욕실", ["r3:rq3", "r4:rq4", "r5:rq5"]],
      ["조명", ["r6:rq6", "r8:rq8"]],
      ["철거", ["r9:rq9"]],
    ]);
  });

  it("지출 예정 8,300,000원 · 남은 예산 1,700,000원 · 미정 1건(R9는 미확정이라 세지 않음)", () => {
    expect(summarizeInteriorPlan(makePlanV())).toStrictEqual({
      budgetWon: 10_000_000,
      plannedTotalWon: 8_300_000,
      tbdCount: 1,
      remainingWon: 1_700_000,
    });
  });

  it("R9를 확정하면 미정 2건, 지출 예정 그대로", () => {
    const plan = makePlanV();
    plan.items[8] = { ...r9(), confirmedQuoteId: "rq9" };
    expect(summarizeInteriorPlan(plan)).toMatchObject({ plannedTotalWon: 8_300_000, tbdCount: 2 });
  });
});

describe("표 모델 업체 칸 — 견적 없음 / 업체 미정 / 이름 (ADR-036 조건 8, 버그 ⑥)", () => {
  it("V의 R8·R9는 업체 미정, 같은 계획에 둔 L의 Y(견적 없음)는 견적 없음", () => {
    const rows = tableRowsOf({ items: [r8(), r9(), legacyY()] });
    expect(rows.map((row) => row.vendor)).toStrictEqual([
      { kind: "tbd" },
      { kind: "tbd" },
      { kind: "none" },
    ]);
    expect(rows.map((row) => tableVendorText(row.vendor))).toStrictEqual(["미정", "미정", ""]);
  });

  it("업체 이름이 글자 그대로 '미정'·'tbd'인 견적과 업체 키 없음 견적은 서로 다른 칸 값이다", () => {
    const rows = tableRowsOf({
      items: [
        quoteItem("named-tbd-text", { id: "a", vendor: "미정" }),
        quoteItem("named-tbd-code", { id: "b", vendor: "tbd" }),
        quoteItem("no-vendor", { id: "c" }),
      ],
    });
    expect(rows.map((row) => row.vendor)).toStrictEqual([
      { kind: "named", name: "미정" },
      { kind: "named", name: "tbd" },
      { kind: "tbd" },
    ]);
    expect(rows[0].vendor).not.toStrictEqual(rows[2].vendor);
  });

  it("tableVendorText: 견적 없음 '' · 업체 미정 '미정' · 이름 그대로", () => {
    expect(tableVendorText({ kind: "none" })).toBe("");
    expect(tableVendorText({ kind: "tbd" })).toBe("미정");
    expect(tableVendorText({ kind: "named", name: "빛나라조명" })).toBe("빛나라조명");
  });
});

describe("CSV — 예시 V 11행 (AC-1, 버그 ⑱)", () => {
  it("업체 미정 칸은 '미정', 계는 8300000 · 금액 미정 1건 제외", () => {
    expect(
      interiorPlanTableToCsvRows(buildInteriorPlanTable(buildInteriorPlanRows(makePlanV()))),
    ).toStrictEqual([
      ["구분", "업체", "세부내용", "견적(원)", "확정(원)", "비고"],
      ["도배", "육문수", "실크 전체", "1800000", "1800000", ""],
      ["도배", "동네도배", "합지", "1500000", "", ""],
      ["도배", "한솔도배", "", "미정", "", ""],
      ["욕실", "하루바스", "철거·방수 (1)", "3700000", "3700000", ""],
      ["욕실", "욕실나라", "철거·방수 (1)", "4000000", "", ""],
      ["욕실", "하루바스", "타일 덧방 (2)", "2500000", "2500000", ""],
      ["조명", "빛나라조명", "거실 매입등", "미정", "미정", ""],
      ["조명", "미정", "거실 간접등", "300000", "300000", ""],
      ["철거", "미정", "", "미정", "", ""],
      ["계", "", "", "", "8300000", "금액 미정 1건 제외"],
    ]);
  });

  it("견적 없는 줄(L의 Y)의 업체 칸은 빈 필드, 업체 미정 R9는 '미정'", () => {
    const [, ...dataRows] = interiorPlanTableToCsvRows(
      buildInteriorPlanTable(buildInteriorPlanRows({ items: [legacyY(), r9()] })),
    );
    expect(dataRows.slice(0, 2).map((row) => row.slice(0, 2))).toStrictEqual([
      ["도배", ""],
      ["철거", "미정"],
    ]);
  });
});

describe("1단계 시트 채우기 (AC-1)", () => {
  it("R9를 열면 업체·견적·세부내용 칸 빈칸('undefined' 아님)", () => {
    expect(toInteriorLineDraft(rowOf(makePlanV(), "r9:rq9"))).toStrictEqual({
      trade: "철거",
      vendor: "",
      amount: "",
      detail: "",
      note: "",
      isConfirmed: false,
    });
  });

  it("R8을 열면 업체 칸 빈칸, 견적 '300000', 세부내용 '거실 간접등', 확정 켜짐", () => {
    expect(toInteriorLineDraft(rowOf(makePlanV(), "r8:rq8"))).toStrictEqual({
      trade: "조명",
      vendor: "",
      amount: "300000",
      detail: "거실 간접등",
      note: "",
      isConfirmed: true,
    });
  });

  it("1단계: 업체 없이 저장하면 '업체 이름을 입력하세요'(업체 칸)", () => {
    const draft = toInteriorLineDraft(rowOf(makePlanV(), "r9:rq9"));
    expect(interiorLineDraftErrors(draft)).toStrictEqual([
      { field: "vendor", message: "업체 이름을 입력하세요" },
    ]);
  });
});

describe("1단계 쓰기가 업체 미정 견적을 보존한다 (AC-0(d), 코드 변경 없음)", () => {
  const values = (overrides: Partial<InteriorLineValues>): InteriorLineValues => ({
    trade: "조명",
    vendor: "빛나라조명",
    isConfirmed: false,
    ...overrides,
  });

  it("R8 확정 끄기 → confirmedQuoteId만 빠지고 견적에 vendor 키가 계속 없다", () => {
    const input = toggleLineConfirmInput(r8(), "rq8", false);
    expect(input).toStrictEqual({
      spaceId: "sp-whole",
      trade: "조명",
      quotes: [{ id: "rq8", memo: "거실 간접등", amountWon: 300_000 }],
      status: "planned",
    });
    expect(Object.hasOwn(input.quotes?.[0] ?? {}, "vendor")).toBe(false);
  });

  it("업체 미정 견적 q2를 단 makeFullItem에서 q1을 고치면 q2는 그대로", () => {
    const full = makeFullItem("planned");
    const vendorless: InteriorQuote = { id: "fq2", amountWon: 4_000_000, memo: "도기 포함" };
    const item: InteriorItem = { ...full, quotes: [full.quotes?.[0] ?? { id: "fq1" }, vendorless] };
    const input = editLineInput(
      item,
      "fq1",
      values({ trade: "욕실", vendor: "하루바스", amountWon: 3_800_000, isConfirmed: true }),
      () => "unused",
    );
    expect(input.quotes?.[1]).toStrictEqual(vendorless);
    expect(Object.hasOwn(input.quotes?.[1] ?? {}, "vendor")).toBe(false);
  });

  it("n≥2 항목에서 업체 미정 견적을 지우면 나머지 견적은 그대로", () => {
    const full = makeFullItem("planned");
    const first = full.quotes?.[0] ?? { id: "fq1" };
    const item: InteriorItem = { ...full, quotes: [first, { id: "fq2" }] };
    const removal = removeLineWrite(item, "fq2");
    expect(removal.kind === "updateItem" && removal.input.quotes).toStrictEqual([first]);
  });

  it("업체 미정 R8에 업체 '빛나라조명'을 채우면 vendor만 더해진다", () => {
    const input = editLineInput(
      r8(),
      "rq8",
      values({ amountWon: 300_000, detail: "거실 간접등", isConfirmed: true }),
      () => "unused",
    );
    expect(input.quotes).toStrictEqual([
      { id: "rq8", vendor: "빛나라조명", amountWon: 300_000, memo: "거실 간접등" },
    ]);
    expect(input.confirmedQuoteId).toBe("rq8");
  });

  it("R9에 업체 '철거왕'만 채우면 견적 { id: 'rq9', vendor: '철거왕' }", () => {
    const input = editLineInput(
      r9(),
      "rq9",
      values({ trade: "철거", vendor: "철거왕" }),
      () => "unused",
    );
    expect(input.quotes).toStrictEqual([{ id: "rq9", vendor: "철거왕" }]);
  });

  it("업체 미정 줄이 없는 P의 표·CSV는 바뀌지 않는다(업체 칸 모두 이름)", () => {
    expect(tableRowsOf(makeSimplePlanP()).map((row) => row.vendor.kind)).toStrictEqual([
      "named",
      "named",
      "named",
      "named",
      "named",
    ]);
  });
});
