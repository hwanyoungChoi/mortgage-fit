// 스펙 interior-simple "데이터 모델 — 줄 ↔ 저장 값 매핑", AC-1(목록·요약·경계)·AC-4(옛 계획 L)·AC-6(옛 P 지출 예정).
import { describe, expect, it } from "vitest";

import { makePlanP } from "@/test/interiorPlanFixture";
import {
  makePlanL,
  makeSimplePlanP,
  makeSimplePlanPPlus,
  r1,
  simpleTime,
} from "@/test/interiorSimpleFixture";

import {
  buildInteriorPlanRows,
  groupConfirmedWonOf,
  rowNoteOf,
  summarizeInteriorPlan,
} from "./interiorPlanRows";

import type { InteriorItem, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

/** 묶음과 줄을 [구분, [업체, 세부내용, 견적, 확정]...] 모양으로 */
const shapeOf = (plan: Pick<InteriorPlanWithItems, "items">) =>
  buildInteriorPlanRows(plan).groups.map((group) => [
    group.trade,
    group.rows.map((row) => [
      row.quote?.vendor ?? "",
      row.quote?.memo ?? "",
      row.quote?.amount ?? null,
      row.isConfirmed,
    ]),
  ]);

/** 견적 1개 항목(새 화면이 만드는 줄) */
const line = (id: string, trade: string, minute: number, amount = 100): InteriorItem => ({
  id,
  spaceId: "sp-whole",
  trade,
  quotes: [{ id: `${id}-q`, vendor: id, amount }],
  status: "planned",
  createdAt: simpleTime(minute),
  updatedAt: simpleTime(minute),
});

const groupedIds = (items: InteriorItem[]) =>
  buildInteriorPlanRows({ items }).groups.map((group) => [
    group.trade,
    group.rows.map((row) => row.item.id),
  ]);

describe("buildInteriorPlanRows — 예시 P (AC-1)", () => {
  it("묶음 [도배: R1, R2] → [욕실: R3, R4, R5], R1·R3·R5만 확정, 지출 예정 800", () => {
    expect(shapeOf(makeSimplePlanP())).toEqual([
      [
        "도배",
        [
          ["육문수", "실크 전체", 180, true],
          ["동네도배", "합지", 150, false],
        ],
      ],
      [
        "욕실",
        [
          ["하루바스", "철거·방수 (1)", 370, true],
          ["욕실나라", "철거·방수 (1)", 400, false],
          ["하루바스", "타일 덧방 (2)", 250, true],
        ],
      ],
    ]);
    expect(buildInteriorPlanRows(makeSimplePlanP()).plannedTotalWon).toBe(8_000_000);
  });

  it("줄 key는 `item.id:quote.id`이고 모두 다르다(인덱스가 아니다)", () => {
    const keys = buildInteriorPlanRows(makeSimplePlanP()).groups.flatMap((group) =>
      group.rows.map((row) => row.key),
    );
    expect(keys).toEqual(["r1:rq1", "r2:rq2", "r3:rq3", "r4:rq4", "r5:rq5"]);
  });

  it("줄은 항목 전체를 들고 있다(숨은 값을 쓰기에서 돌려보낼 수 있게)", () => {
    const [first] = buildInteriorPlanRows(makeSimplePlanP()).groups[0].rows;
    expect(first.item).toStrictEqual(r1());
    expect(first.budgetNoteWon).toBeNull();
  });

  it("줄 0개면 묶음 없음, 지출 예정 0", () => {
    expect(buildInteriorPlanRows({ items: [] })).toEqual({
      groups: [],
      plannedTotalWon: 0,
      doneTotalWon: 0,
      doneCount: 0,
      tbdCount: 0,
    });
  });
});

describe("buildInteriorPlanRows — 묶음 규칙 (A3·U5)", () => {
  it("항목 입력순 도배A·욕실B·도배C → [도배: A, C][욕실: B], A를 지우면 [욕실: B][도배: C]", () => {
    const a = line("a", "도배", 1);
    const b = line("b", "욕실", 2);
    const c = line("c", "도배", 3);
    expect(groupedIds([a, b, c])).toEqual([
      ["도배", ["a", "c"]],
      ["욕실", ["b"]],
    ]);
    expect(groupedIds([b, c])).toEqual([
      ["욕실", ["b"]],
      ["도배", ["c"]],
    ]);
  });

  it('" 도배"·"도배"는 한 묶음, "도 배"·"도배 공사"·"Tile"/"tile"은 다른 묶음(정규화 없음)', () => {
    expect(
      groupedIds([
        line("a", " 도배", 1),
        line("b", "도배", 2),
        line("c", "도 배", 3),
        line("d", "도배 공사", 4),
        line("e", "Tile", 5),
        line("f", "tile", 6),
      ]),
    ).toEqual([
      ["도배", ["a", "b"]],
      ["도 배", ["c"]],
      ["도배 공사", ["d"]],
      ["Tile", ["e"]],
      ["tile", ["f"]],
    ]);
  });

  it("새 줄의 구분이 기존 묶음과 같으면 그 묶음 끝에 보인다", () => {
    const plan = makeSimplePlanP();
    const added = line("r6", "도배", 6);
    expect(groupedIds([...plan.items, added])).toEqual([
      ["도배", ["r1", "r2", "r6"]],
      ["욕실", ["r3", "r4", "r5"]],
    ]);
  });

  it("한 구분에 여러 줄을 확정할 수 있다(욕실 R3·R5 둘 다 확정, 지출 예정에 둘 다 든다)", () => {
    const bath = buildInteriorPlanRows(makeSimplePlanP()).groups[1];
    expect(bath.rows.filter((row) => row.isConfirmed).map((row) => row.item.id)).toEqual([
      "r3",
      "r5",
    ]);
  });
});

describe("buildInteriorPlanRows — 옛 계획 L (AC-4)", () => {
  it("[욕실: 하루바스 철거·방수 370 ✓, 욕실나라 400, 하루바스 타일 덧방 250] → [도배: 빈 줄, 예산 200], 지출 예정 370", () => {
    const rows = buildInteriorPlanRows(makePlanL());
    expect(shapeOf(makePlanL())).toEqual([
      [
        "욕실",
        [
          ["하루바스", "철거·방수", 370, true],
          ["욕실나라", "", 400, false],
          ["하루바스", "타일 덧방", 250, false],
        ],
      ],
      ["도배", [["", "", null, false]]],
    ]);
    expect(rows.plannedTotalWon).toBe(3_700_000);
    expect(rows.groups.flatMap((group) => group.rows.map((row) => row.key))).toEqual([
      "item-x:q1",
      "item-x:q2",
      "item-z:q3",
      "item-y:",
    ]);
  });

  it("빈 줄(견적 0개)만 비고용 예산을 들고, 견적이 있는 줄은 항목 예산이 있어도 null", () => {
    const rows = buildInteriorPlanRows(makePlanL()).groups.flatMap((group) => group.rows);
    expect(rows.map((row) => [row.key, row.budgetNoteWon])).toEqual([
      ["item-x:q1", null],
      ["item-x:q2", null],
      ["item-z:q3", null],
      ["item-y:", 2_000_000],
    ]);
  });

  it("예산도 견적도 없는 항목은 비고 예산 null인 빈 줄 하나", () => {
    const empty: InteriorItem = {
      id: "e",
      spaceId: "s0",
      trade: "조명",
      status: "planned",
      createdAt: simpleTime(1),
      updatedAt: simpleTime(1),
    };
    const [group] = buildInteriorPlanRows({ items: [empty] }).groups;
    expect(group.rows).toEqual([
      {
        key: "e:",
        item: empty,
        quote: null,
        quoteWon: undefined,
        isConfirmed: false,
        isDone: false,
        budgetNoteWon: null,
      },
    ]);
  });

  it("확정 견적 id가 견적에 없으면 확정 줄이 없다(지출 예정 0)", () => {
    const item: InteriorItem = { ...line("x", "도배", 1), confirmedQuoteId: "no-such-quote" };
    const rows = buildInteriorPlanRows({ items: [item] });
    expect(rows.groups[0].rows.map((row) => row.isConfirmed)).toEqual([false]);
    expect(rows.plannedTotalWon).toBe(0);
  });

  it("옛 P(makePlanP): 지출 예정 1,530 = 도배 A 280 + 샷시 E 1,250(예산·미확정 견적은 세지 않는다)", () => {
    expect(buildInteriorPlanRows(makePlanP()).plannedTotalWon).toBe(15_300_000);
  });
});

describe("summarizeInteriorPlan — 총 예산·지출 예정·남은 예산 (AC-1)", () => {
  it("P: 총 예산 1,000 · 지출 예정 800 · 남은 예산 200", () => {
    expect(summarizeInteriorPlan(makeSimplePlanP())).toEqual({
      budgetWon: 10_000_000,
      plannedTotalWon: 8_000_000,
      doneTotalWon: 0,
      doneCount: 0,
      tbdCount: 0,
      remainingWon: 2_000_000,
    });
  });

  it.each([
    [800, 0],
    [799, -10_000],
    [700, -1_000_000],
  ])("총 예산 %i만원 → 남은 예산 %i원(0은 초과 아님, 음수는 예산 초과)", (budget, remainingWon) => {
    expect(summarizeInteriorPlan(makeSimplePlanP({ budget })).remainingWon).toBe(remainingWon);
  });

  it("총 예산이 없으면 budgetWon·remainingWon null, 지출 예정은 그대로", () => {
    const { budget, ...withoutBudget } = makeSimplePlanP();
    void budget;
    expect(summarizeInteriorPlan(withoutBudget)).toEqual({
      budgetWon: null,
      plannedTotalWon: 8_000_000,
      doneTotalWon: 0,
      doneCount: 0,
      tbdCount: 0,
      remainingWon: null,
    });
  });

  it("줄 0개: 지출 예정 0 · 남은 예산 = 총 예산", () => {
    expect(summarizeInteriorPlan(makeSimplePlanP({ items: [] }))).toEqual({
      budgetWon: 10_000_000,
      plannedTotalWon: 0,
      doneTotalWon: 0,
      doneCount: 0,
      tbdCount: 0,
      remainingWon: 10_000_000,
    });
  });

  it("L: 총 예산 3,000 · 지출 예정 370 · 남은 예산 2,630", () => {
    expect(summarizeInteriorPlan(makePlanL())).toEqual({
      budgetWon: 30_000_000,
      plannedTotalWon: 3_700_000,
      doneTotalWon: 0,
      doneCount: 0,
      tbdCount: 0,
      remainingWon: 26_300_000,
    });
  });

  it("항목 100개 모두 999,999,999만원 확정 → 지출 예정 999,999,999,000,000원(정수 오차 없음)", () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      ...line(`m${index}`, "도배", 1, 999_999_999),
      confirmedQuoteId: `m${index}-q`,
    }));
    const { plannedTotalWon } = summarizeInteriorPlan(makeSimplePlanP({ items }));
    expect(plannedTotalWon).toBe(999_999_999_000_000);
    expect(Number.isSafeInteger(plannedTotalWon)).toBe(true);
  });
});

describe("rowNoteOf — 비고 = 항목 메모 · (빈 줄이면) 예산", () => {
  const notesOf = (plan: InteriorPlanWithItems) =>
    buildInteriorPlanRows(plan).groups.flatMap((group) => group.rows.map((row) => rowNoteOf(row)));

  it("L: 항목 메모는 그 항목의 모든 줄에, 빈 줄은 '예산 2,000,000원', 견적 있는 줄에는 예산 조각이 없다", () => {
    expect(notesOf(makePlanL())).toEqual(["폐기물 포함", "폐기물 포함", "", "예산 2,000,000원"]);
  });

  it("빈 줄에 메모와 예산이 둘 다 있으면 ' · '로 잇고, 금액은 원(항목 예산 만원 × 10,000)", () => {
    const item: InteriorItem = {
      id: "a",
      spaceId: "s0",
      trade: "에어컨",
      budget: 150,
      memo: "추후 구매",
      status: "planned",
      createdAt: simpleTime(1),
      updatedAt: simpleTime(1),
    };
    const [row] = buildInteriorPlanRows({ items: [item] }).groups[0].rows;
    expect(rowNoteOf(row)).toBe("추후 구매 · 예산 1,500,000원");
  });

  it("P: 메모·예산이 없어 모두 빈 문자열", () => {
    expect(notesOf(makeSimplePlanP())).toEqual(["", "", "", "", ""]);
  });
});

describe("groupConfirmedWonOf — 묶음 제목 오른쪽 확정 합계", () => {
  const totalsOf = (plan: Pick<InteriorPlanWithItems, "items">) =>
    buildInteriorPlanRows(plan).groups.map((group) => [group.trade, groupConfirmedWonOf(group)]);

  it("P⁺: 확정이고 금액이 있는 줄만 더하고, 그런 줄이 없는 묶음(조명: 확정 미정뿐)은 null", () => {
    expect(totalsOf(makeSimplePlanPPlus())).toEqual([
      ["도배", 1_800_000],
      ["욕실", 6_200_000],
      ["조명", null],
    ]);
  });

  it("완료 줄도 더한다", () => {
    const done = { ...r1(), status: "done" as const };
    expect(totalsOf({ items: [done] })).toEqual([["도배", 1_800_000]]);
  });
});
