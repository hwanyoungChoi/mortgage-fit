import { describe, expect, it } from "vitest";

import { INTERIOR_TRADES } from "@/lib/constants/interiorPlan";

import { sortInteriorTrades } from "./sortInteriorTrades";

const at = (minute: number) => `2026-10-26T00:${String(minute).padStart(2, "0")}:00.000Z`;
const item = (trade: string, minute = 0) => ({ trade, createdAt: at(minute) });

describe("공정 순서 상수 (AC-3, U3)", () => {
  it("14단계, 타일 → 욕실 순", () => {
    expect(INTERIOR_TRADES).toEqual([
      "철거",
      "샷시",
      "설비",
      "전기",
      "목공",
      "타일",
      "욕실",
      "도장",
      "필름",
      "도배",
      "바닥",
      "주방가구",
      "조명",
      "입주 청소",
    ]);
  });
});

describe("sortInteriorTrades (AC-3)", () => {
  it("P: 도배·타일·샷시·주방가구 순으로 만든 항목 → 샷시 → 타일 → 도배 → 주방가구", () => {
    expect(
      sortInteriorTrades([item("도배", 1), item("타일", 2), item("샷시", 3), item("주방가구", 4)]),
    ).toEqual(["샷시", "타일", "도배", "주방가구"]);
  });

  it("프리셋 14개를 거꾸로 넣어도 상수 순서로 나온다", () => {
    expect(sortInteriorTrades(INTERIOR_TRADES.toReversed().map((trade) => item(trade)))).toEqual(
      INTERIOR_TRADES,
    );
  });

  it("타일과 욕실은 타일이 먼저", () => {
    expect(sortInteriorTrades([item("욕실", 1), item("타일", 2)])).toEqual(["타일", "욕실"]);
  });

  it("직접 입력 공종은 프리셋 뒤, 처음 만든 항목의 createdAt 순: 방충망(먼저) → 단열(나중)", () => {
    expect(sortInteriorTrades([item("단열", 5), item("도배", 9), item("방충망", 1)])).toEqual([
      "도배",
      "방충망",
      "단열",
    ]);
  });

  it("목록 순서가 아니라 createdAt 순이다(목록: 단열, 방충망 / 시각: 방충망 먼저)", () => {
    expect(sortInteriorTrades([item("단열", 2), item("방충망", 1)])).toEqual(["방충망", "단열"]);
  });

  it("직접 입력 공종의 순서는 그 공종의 가장 이른 항목 기준이다", () => {
    // 단열: 3분·0분 / 방충망: 1분 → 단열(0분)이 먼저
    expect(sortInteriorTrades([item("방충망", 1), item("단열", 3), item("단열", 0)])).toEqual([
      "단열",
      "방충망",
    ]);
  });

  it("createdAt이 같으면 목록 순서를 지킨다(안정 정렬)", () => {
    expect(sortInteriorTrades([item("단열", 1), item("방충망", 1)])).toEqual(["단열", "방충망"]);
    expect(sortInteriorTrades([item("방충망", 1), item("단열", 1)])).toEqual(["방충망", "단열"]);
  });

  it("같은 공종은 한 번만 나온다", () => {
    expect(
      sortInteriorTrades([item("도배"), item("도배"), item("방충망"), item("방충망")]),
    ).toEqual(["도배", "방충망"]);
  });

  it("프리셋과 글자가 다르면(띄어쓰기·접미) 직접 입력으로 본다", () => {
    expect(sortInteriorTrades([item("입주청소", 1), item("철거", 2), item("도배2", 3)])).toEqual([
      "철거",
      "입주청소",
      "도배2",
    ]);
  });

  it("빈 목록 → 빈 배열, 입력 배열을 바꾸지 않는다", () => {
    expect(sortInteriorTrades([])).toEqual([]);
    const items = [item("단열", 2), item("방충망", 1)];
    const before = structuredClone(items);
    sortInteriorTrades(items);
    expect(items).toEqual(before);
  });
});
