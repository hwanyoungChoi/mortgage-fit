// 스펙 interior-planner "표 내보내기 — 줄 만들기", AC-11(태스크 5-2). 금액 기대값은 모두 만원 × 10,000을 손으로 계산한 값이다.
import { describe, expect, it } from "vitest";

import { makePlanP, P_SPACES, pTime } from "@/test/interiorPlanFixture";
import { makePlanQ, qAircon } from "@/test/interiorPlanTableFixture";

import { formatThousands } from "./amount";
import { buildInteriorPlanTable } from "./buildInteriorPlanTable";
import { summarizeInteriorPlan } from "./summarizeInteriorPlan";

import type { InteriorPlanTable, InteriorPlanTableRow } from "./buildInteriorPlanTable";
import type { InteriorItem, InteriorPlanWithItems, InteriorQuote } from "@/lib/types/interiorPlan";

const NOW = new Date(2026, 9, 27, 12, 0, 0);

const tableOf = (plan: InteriorPlanWithItems) =>
  buildInteriorPlanTable(summarizeInteriorPlan(plan, NOW).tradeGroups);

/** 구분과 줄을 펼친 모양: [구분, 업체, 공간, 견적 메모, 견적(원), 확정(원), 비고] */
const flat = (table: InteriorPlanTable) =>
  table.groups.flatMap((group) =>
    group.rows.map((row) => [
      group.trade,
      row.vendor,
      row.spaceLabel,
      row.quoteMemo,
      row.quoteWon,
      row.confirmedWon,
      row.note,
    ]),
  );

let itemSeq = 0;
/** 플랜 하나에 넣을 항목(기본: 욕실1/타일, 예산·견적·메모 없음) */
function item(fields: Partial<InteriorItem> = {}): InteriorItem {
  itemSeq += 1;
  return {
    id: `item-${itemSeq}`,
    spaceId: "sp-bath1",
    trade: "타일",
    status: "planned",
    createdAt: pTime(1),
    updatedAt: pTime(1),
    ...fields,
  };
}

const quotes = (...entries: [string, number, string?][]): InteriorQuote[] =>
  entries.map(([vendor, amount, memo], index) => ({
    id: `quote-${index}`,
    vendor,
    amount,
    ...(memo !== undefined && { memo }),
  }));

const planWith = (items: InteriorItem[], fields: Partial<InteriorPlanWithItems> = {}) =>
  makePlanP({ items, ...fields });

/** 항목 하나짜리 플랜의 그 줄 */
const onlyRow = (one: InteriorItem): InteriorPlanTableRow => {
  const table = tableOf(planWith([one]));
  expect(table.groups).toHaveLength(1);
  expect(table.groups[0].rows).toHaveLength(1);
  return table.groups[0].rows[0];
};

describe("buildInteriorPlanTable — 예시 Q (AC-11 'Q 표')", () => {
  it("줄 순서 욕실 → 필름 → 바닥 → 에어컨(직접 입력은 맨 뒤), 욕실 안은 q3 → q4, 열 값이 Q 표와 같다", () => {
    const table = tableOf(makePlanQ());
    expect(table.groups.map((group) => [group.trade, group.rows.length])).toEqual([
      ["욕실", 2],
      ["필름", 1],
      ["바닥", 1],
      ["에어컨", 1],
    ]);
    expect(flat(table)).toEqual([
      [
        "욕실",
        "숨고_하루바스",
        "[욕실1]",
        "철거, 방수, 도기 교체",
        3_700_000,
        3_700_000,
        "폐기물처리 포함 · 예산 대비 700,000원 초과",
      ],
      // 미확정 q4: 첫 견적(숨고_하루바스 250)이 아니라 최저 동네욕실 230, 확정 빈칸
      ["욕실", "동네욕실", "[욕실2]", "", 2_300_000, undefined, "미확정 · 견적 2개 중 최저"],
      ["필름", "숨고_빛인테리어필름", "[전체]", "샷시·몰딩", 2_000_000, 2_000_000, ""],
      ["바닥", "육문수", "[전체]", "2.2T 장판", 1_800_000, 1_800_000, ""],
      // 견적 0개 q5: 업체·견적·확정 빈칸, 비고 = 항목 메모 · 예산
      ["에어컨", "", "[거실]", "", undefined, undefined, "추후 구매 · 예산 1,500,000원"],
    ]);
  });

  it("계: 견적 9,800,000 · 확정 7,500,000 = 요약 confirmedTotal(750) × 10,000", () => {
    const plan = makePlanQ();
    const summary = summarizeInteriorPlan(plan, NOW);
    const table = buildInteriorPlanTable(summary.tradeGroups);
    expect(table.totals).toEqual({ quote: 9_800_000, confirmed: 7_500_000 });
    expect(summary.confirmedTotal).toBe(750);
    expect(table.totals.confirmed).toBe(summary.confirmedTotal * 10_000);
  });

  it("계 견적은 대표 견적 합이고 요약 '예상 총액'(1,150 × 10,000)과 다르다(미확정 q4는 예산 250, q5는 예산 150)", () => {
    const summary = summarizeInteriorPlan(makePlanQ(), NOW);
    expect(summary.expectedTotal).toBe(180 + 200 + 370 + 250 + 150);
    expect(buildInteriorPlanTable(summary.tradeGroups).totals.quote).not.toBe(
      summary.expectedTotal * 10_000,
    );
  });
});

describe("buildInteriorPlanTable — fixture P (AC-11 필수: 확정이 최저가 아닌 줄)", () => {
  it("샷시(확정 E 1,250 > 최저 D 1,150) → 타일 → 도배 → 주방가구, 계 21,800,000 / 15,300,000", () => {
    const plan = makePlanP();
    const summary = summarizeInteriorPlan(plan, NOW);
    const table = buildInteriorPlanTable(summary.tradeGroups);
    expect(flat(table)).toEqual([
      ["샷시", "E샷시", "[전체]", "", 12_500_000, 12_500_000, "예산 대비 500,000원 초과"],
      ["타일", "C타일", "[욕실1]", "", 6_500_000, undefined, "미확정"],
      ["도배", "A도배", "[거실]", "", 2_800_000, 2_800_000, ""],
      ["주방가구", "", "[주방]", "", undefined, undefined, "예산 5,000,000원"],
    ]);
    expect(table.totals).toEqual({ quote: 21_800_000, confirmed: 15_300_000 });
    expect(table.totals.confirmed).toBe(summary.confirmedTotal * 10_000);
  });
});

describe("buildInteriorPlanTable — 대표 견적 경계 (AC-11 경계 입력)", () => {
  it("동률 [Z 300, X 200, Y 200] 미확정 → 먼저 적은 X, 2,000,000, 확정 빈칸, '미확정 · 견적 3개 중 최저'", () => {
    const row = onlyRow(item({ quotes: quotes(["Z", 300], ["X", 200], ["Y", 200]) }));
    expect(row).toEqual({
      vendor: "X",
      spaceLabel: "[욕실1]",
      quoteMemo: "",
      quoteWon: 2_000_000,
      confirmedWon: undefined,
      note: "미확정 · 견적 3개 중 최저",
    });
  });

  it("최저가 마지막 [300, 200] 미확정 → 두 번째 견적과 그 메모, '미확정 · 견적 2개 중 최저'", () => {
    const row = onlyRow(
      item({ quotes: quotes(["첫업체", 300, "첫 메모"], ["둘째업체", 200, "둘째 메모"]) }),
    );
    expect(row.vendor).toBe("둘째업체");
    expect(row.quoteMemo).toBe("둘째 메모");
    expect(row.quoteWon).toBe(2_000_000);
    expect(row.note).toBe("미확정 · 견적 2개 중 최저");
  });

  it("견적 5개 미확정 → '미확정 · 견적 5개 중 최저'", () => {
    const row = onlyRow(
      item({ quotes: quotes(["a", 500], ["b", 400], ["c", 300], ["d", 350], ["e", 450]) }),
    );
    expect(row.vendor).toBe("c");
    expect(row.note).toBe("미확정 · 견적 5개 중 최저");
  });

  it("확정이 최저도 첫 견적도 아니면 확정 견적(확정 우선)", () => {
    const one = item({
      budget: 1000,
      quotes: quotes(["싼곳", 100, "싼 메모"], ["비싼곳", 900, "비싼 메모"], ["중간", 500]),
    });
    const row = onlyRow({ ...one, confirmedQuoteId: "quote-1" });
    expect(row).toEqual({
      vendor: "비싼곳",
      spaceLabel: "[욕실1]",
      quoteMemo: "비싼 메모",
      quoteWon: 9_000_000,
      confirmedWon: 9_000_000,
      note: "",
    });
  });

  it("확정 견적 id가 견적에 없으면 미확정으로 본다(최저, 확정 빈칸)", () => {
    const one = item({ quotes: quotes(["a", 300], ["b", 200]) });
    const row = onlyRow({ ...one, confirmedQuoteId: "no-such-quote" });
    expect(row.vendor).toBe("b");
    expect(row.confirmedWon).toBeUndefined();
    expect(row.note).toBe("미확정 · 견적 2개 중 최저");
  });
});

describe("buildInteriorPlanTable — 비고 조각 조합 (①항목 메모 ②미확정 ③초과 ④예산)", () => {
  it("①② 항목 메모 + 미확정(견적 1개) → '철거 별도 · 미확정'", () => {
    expect(onlyRow(item({ memo: "철거 별도", quotes: quotes(["a", 100]) })).note).toBe(
      "철거 별도 · 미확정",
    );
  });

  it("①③ 항목 메모 + 확정 초과", () => {
    const one = item({ memo: "메모", budget: 100, quotes: quotes(["a", 123]) });
    expect(onlyRow({ ...one, confirmedQuoteId: "quote-0" }).note).toBe(
      "메모 · 예산 대비 230,000원 초과",
    );
  });

  it("①④ 항목 메모 + 견적 0개·예산", () => {
    expect(onlyRow(item({ memo: "메모", budget: 7 })).note).toBe("메모 · 예산 70,000원");
  });

  it("② 미확정만, ③ 초과만, ④ 예산만", () => {
    expect(onlyRow(item({ budget: 50, quotes: quotes(["a", 100]) })).note).toBe("미확정");
    const over = item({ budget: 50, quotes: quotes(["a", 100]) });
    expect(onlyRow({ ...over, confirmedQuoteId: "quote-0" }).note).toBe("예산 대비 500,000원 초과");
    expect(onlyRow(item({ budget: 1 })).note).toBe("예산 10,000원");
  });

  it("확정 = 예산(초과 0)이면 초과 조각이 없다", () => {
    const one = item({ budget: 100, quotes: quotes(["a", 100]) });
    expect(onlyRow({ ...one, confirmedQuoteId: "quote-0" }).note).toBe("");
  });

  it("비고가 빈 줄: 견적 0개·예산 없음·항목 메모 없음 → 업체·견적·확정·비고 빈칸, 세부내용은 [공간]뿐", () => {
    expect(onlyRow(item())).toEqual({
      vendor: "",
      spaceLabel: "[욕실1]",
      quoteMemo: "",
      quoteWon: undefined,
      confirmedWon: undefined,
      note: "",
    });
  });
});

describe("buildInteriorPlanTable — 공간·구분", () => {
  it("공간이 사라진 항목은 [공간 없음], 대표 견적 메모가 있으면 그 메모", () => {
    const gone = item({ spaceId: "sp-deleted", quotes: quotes(["a", 10, "메모"]) });
    expect(onlyRow(gone)).toMatchObject({ spaceLabel: "[공간 없음]", quoteMemo: "메모" });
    expect(onlyRow(item({ spaceId: "sp-deleted" })).spaceLabel).toBe("[공간 없음]");
  });

  it("구분은 저장된 공종 이름 그대로(직접 입력 포함), 직접 입력 공종은 맨 뒤 입력순", () => {
    const table = tableOf(
      planWith([
        item({ trade: "방충망" }),
        item({ trade: "도배" }),
        item({ trade: "단열" }),
        item({ trade: "샷시" }),
      ]),
    );
    expect(table.groups.map((group) => group.trade)).toEqual(["샷시", "도배", "방충망", "단열"]);
  });
});

describe("buildInteriorPlanTable — 합계 0과 빈 입력", () => {
  it("q5만 있는 플랜: 계 견적 0 · 확정 0(빈칸이 아니라 0)", () => {
    expect(tableOf(makePlanQ({ items: [qAircon()] })).totals).toEqual({ quote: 0, confirmed: 0 });
  });

  it("buildInteriorPlanTable([]) → groups [] · totals 0/0", () => {
    expect(buildInteriorPlanTable([])).toEqual({ groups: [], totals: { quote: 0, confirmed: 0 } });
    expect(tableOf(makePlanQ({ items: [] }))).toEqual({
      groups: [],
      totals: { quote: 0, confirmed: 0 },
    });
  });
});

describe("buildInteriorPlanTable — 최대 금액(정확한 값)", () => {
  const maxItem = (index: number): InteriorItem => ({
    id: `max-${index}`,
    spaceId: P_SPACES[index % P_SPACES.length].id,
    trade: "도배",
    budget: 999_999_999,
    quotes: [{ id: `mq-${index}`, vendor: "업체", amount: 999_999_999 }],
    confirmedQuoteId: `mq-${index}`,
    status: "confirmed",
    createdAt: pTime(1),
    updatedAt: pTime(1),
  });

  it("한 줄 확정 999,999,999 → 9999999990000", () => {
    const row = onlyRow(maxItem(0));
    expect(row.quoteWon).toBe(9_999_999_990_000);
    expect(row.confirmedWon).toBe(9_999_999_990_000);
  });

  it("항목 100개 모두 확정 999,999,999 → 계 999999999000000, 화면 문자열 999,999,999,000,000", () => {
    const plan = planWith(Array.from({ length: 100 }, (_, index) => maxItem(index)));
    const summary = summarizeInteriorPlan(plan, NOW);
    const table = buildInteriorPlanTable(summary.tradeGroups);
    expect(table.totals.confirmed).toBe(999_999_999_000_000);
    expect(table.totals.quote).toBe(999_999_999_000_000);
    expect(table.totals.confirmed).toBe(summary.confirmedTotal * 10_000);
    expect(formatThousands(table.totals.confirmed)).toBe("999,999,999,000,000");
    expect(Number.isSafeInteger(table.totals.confirmed)).toBe(true);
  });
});
