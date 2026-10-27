// 스펙 interior-simple "표 보기"·AC-5(줄 = 목록의 줄, 계는 확정만, 비고 = 항목 메모 · 빈 줄의 예산).
// 금액 기대값은 모두 만원 × 10,000을 손으로 계산한 값이다.
import { describe, expect, it } from "vitest";

import { makePlanP, P_SPACES, pTime } from "@/test/interiorPlanFixture";
import { makePlanQ, qAircon } from "@/test/interiorPlanTableFixture";
import { makePlanL, makeSimplePlanP } from "@/test/interiorSimpleFixture";

import { formatThousands } from "./amount";
import { buildInteriorPlanTable } from "./buildInteriorPlanTable";
import { buildInteriorPlanRows, summarizeInteriorPlan } from "./interiorPlanRows";

import type { InteriorPlanTable, InteriorPlanTableRow } from "./buildInteriorPlanTable";
import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

const tableOf = (plan: Pick<InteriorPlanWithItems, "items">) =>
  buildInteriorPlanTable(buildInteriorPlanRows(plan));

/** 구분과 줄을 펼친 모양: [구분, 업체, 세부내용, 견적(원), 확정(원), 비고] */
const flat = (table: InteriorPlanTable) =>
  table.groups.flatMap((group) =>
    group.rows.map((row) => [
      group.trade,
      row.vendor,
      row.detail,
      row.quoteWon,
      row.confirmedWon,
      row.note,
    ]),
  );

let itemSeq = 0;
/** 항목 하나(기본: 타일, 예산·견적·메모 없음) */
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

/** 항목 하나짜리 계획의 그 줄 */
const onlyRow = (one: InteriorItem): InteriorPlanTableRow => {
  const table = tableOf({ items: [one] });
  expect(table.groups).toHaveLength(1);
  expect(table.groups[0].rows).toHaveLength(1);
  return table.groups[0].rows[0];
};

describe("buildInteriorPlanTable — 예시 P (AC-5)", () => {
  it("목록과 같은 순서 5줄, 확정 R1·R3·R5만 확정 칸, 계 8,000,000", () => {
    const table = tableOf(makeSimplePlanP());
    expect(flat(table)).toEqual([
      ["도배", "육문수", "실크 전체", 1_800_000, 1_800_000, ""],
      ["도배", "동네도배", "합지", 1_500_000, undefined, ""],
      ["욕실", "하루바스", "철거·방수 (1)", 3_700_000, 3_700_000, ""],
      ["욕실", "욕실나라", "철거·방수 (1)", 4_000_000, undefined, ""],
      ["욕실", "하루바스", "타일 덧방 (2)", 2_500_000, 2_500_000, ""],
    ]);
    expect(table.confirmedTotal).toBe(8_000_000);
  });

  it("계는 확정 칸만 있고 견적 합계는 두지 않는다(U6), 계 = 지출 예정 × 10,000", () => {
    const plan = makeSimplePlanP();
    const table = tableOf(plan);
    expect(Object.keys(table).toSorted()).toEqual(["confirmedTotal", "groups", "totalNote"]);
    expect(table.confirmedTotal).toBe(summarizeInteriorPlan(plan).plannedTotal * 10_000);
  });
});

describe("buildInteriorPlanTable — 옛 계획 L (AC-5)", () => {
  it("견적마다 한 줄, 항목 메모는 그 항목의 모든 줄, 빈 줄 비고 '예산 2,000,000원', 옛 비고 조각 없음, 계 3,700,000", () => {
    const table = tableOf(makePlanL());
    expect(flat(table)).toEqual([
      ["욕실", "하루바스", "철거·방수", 3_700_000, 3_700_000, "폐기물 포함"],
      ["욕실", "욕실나라", "", 4_000_000, undefined, "폐기물 포함"],
      ["욕실", "하루바스", "타일 덧방", 2_500_000, undefined, ""],
      ["도배", "", "", undefined, undefined, "예산 2,000,000원"],
    ]);
    expect(table.confirmedTotal).toBe(3_700_000);
    expect(JSON.stringify(table)).not.toMatch(/미확정|최저|초과/);
  });
});

describe("buildInteriorPlanTable — 예시 Q·옛 P (여러 견적 항목)", () => {
  it("Q: 바닥 → 필름 → 욕실(q3 견적 2줄 → q4 견적 2줄) → 에어컨, 계 7,500,000 = 지출 예정(750) × 10,000", () => {
    const plan = makePlanQ();
    const table = tableOf(plan);
    expect(table.groups.map((group) => [group.trade, group.rows.length])).toEqual([
      ["바닥", 1],
      ["필름", 1],
      ["욕실", 4],
      ["에어컨", 1],
    ]);
    expect(flat(table)).toEqual([
      ["바닥", "육문수", "2.2T 장판", 1_800_000, 1_800_000, ""],
      ["필름", "숨고_빛인테리어필름", "샷시·몰딩", 2_000_000, 2_000_000, ""],
      ["욕실", "숨고_하루바스", "철거, 방수, 도기 교체", 3_700_000, 3_700_000, "폐기물처리 포함"],
      ["욕실", "욕실나라", "", 4_000_000, undefined, "폐기물처리 포함"],
      ["욕실", "숨고_하루바스", "타일 덧방", 2_500_000, undefined, ""],
      ["욕실", "동네욕실", "", 2_300_000, undefined, ""],
      ["에어컨", "", "", undefined, undefined, "추후 구매 · 예산 1,500,000원"],
    ]);
    expect(table.confirmedTotal).toBe(7_500_000);
    expect(summarizeInteriorPlan(plan).plannedTotal).toBe(750);
  });

  it("옛 P: 확정이 최저가 아닌 샷시(D 11,500,000 미확정 · E 12,500,000 확정)도 견적마다 한 줄, 계 15,300,000", () => {
    const table = tableOf(makePlanP());
    expect(flat(table)).toEqual([
      ["도배", "A도배", "", 2_800_000, 2_800_000, ""],
      ["도배", "B도배", "", 3_200_000, undefined, ""],
      ["타일", "C타일", "", 6_500_000, undefined, ""],
      ["샷시", "D샷시", "", 11_500_000, undefined, ""],
      ["샷시", "E샷시", "", 12_500_000, 12_500_000, ""],
      ["주방가구", "", "", undefined, undefined, "예산 5,000,000원"],
    ]);
    expect(table.confirmedTotal).toBe(15_300_000);
  });

  it("확정 견적 id가 견적에 없으면 그 항목의 줄은 모두 미확정(확정 빈칸)", () => {
    const one = item({
      quotes: [
        { id: "a", vendor: "a", amount: 300 },
        { id: "b", vendor: "b", amount: 200 },
      ],
      confirmedQuoteId: "no-such-quote",
    });
    const table = tableOf({ items: [one] });
    expect(table.groups[0].rows.map((row) => row.confirmedWon)).toEqual([undefined, undefined]);
    expect(table.confirmedTotal).toBe(0);
  });
});

describe("buildInteriorPlanTable — 비고 (항목 메모 · 빈 줄의 예산)", () => {
  it("빈 줄의 항목 메모 + 예산 → '메모 · 예산 70,000원'", () => {
    expect(onlyRow(item({ memo: "메모", budget: 7 })).note).toBe("메모 · 예산 70,000원");
  });

  it("빈 줄의 예산만 → '예산 10,000원'", () => {
    expect(onlyRow(item({ budget: 1 })).note).toBe("예산 10,000원");
  });

  it("견적이 있는 줄은 항목 예산이 있어도 비고에 예산이 없다(항목 메모만)", () => {
    const row = onlyRow(
      item({ memo: "철거 별도", budget: 50, quotes: [{ id: "q", vendor: "a", amount: 100 }] }),
    );
    expect(row.note).toBe("철거 별도");
  });

  it("비고가 빈 줄: 견적 0개·예산 없음·항목 메모 없음 → 업체·세부내용·견적·확정·비고 빈칸", () => {
    expect(onlyRow(item())).toEqual({
      vendor: "",
      detail: "",
      quoteWon: undefined,
      confirmedWon: undefined,
      note: "",
    });
  });
});

describe("buildInteriorPlanTable — 구분", () => {
  it("구분은 저장된 이름 그대로(직접 입력 포함), 묶음은 처음 나온 순(공정 순서로 다시 정렬하지 않는다)", () => {
    const table = tableOf({
      items: [
        item({ trade: "방충망" }),
        item({ trade: "도배" }),
        item({ trade: "단열" }),
        item({ trade: "샷시" }),
      ],
    });
    expect(table.groups.map((group) => group.trade)).toEqual(["방충망", "도배", "단열", "샷시"]);
  });
});

describe("buildInteriorPlanTable — 합계 0과 빈 입력", () => {
  it("q5만 있는 계획: 계 0(빈칸이 아니라 0)", () => {
    expect(tableOf({ items: [qAircon()] }).confirmedTotal).toBe(0);
  });

  it("줄 0개 → groups [] · 계 0", () => {
    expect(tableOf({ items: [] })).toEqual({ groups: [], confirmedTotal: 0, totalNote: "" });
    expect(tableOf(makePlanQ({ items: [] }))).toEqual({
      groups: [],
      confirmedTotal: 0,
      totalNote: "",
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
    const plan = makePlanP({ items: Array.from({ length: 100 }, (_, index) => maxItem(index)) });
    const table = tableOf(plan);
    expect(table.confirmedTotal).toBe(999_999_999_000_000);
    expect(table.confirmedTotal).toBe(summarizeInteriorPlan(plan).plannedTotal * 10_000);
    expect(formatThousands(table.confirmedTotal)).toBe("999,999,999,000,000");
    expect(Number.isSafeInteger(table.confirmedTotal)).toBe(true);
  });
});
