// ADR-034 조건 6(qa Q9): 1단계 시트가 원 금액을 만원 칸에 채우는 규칙의 경계. 2단계에서 원 입력으로 바꿀 때 함께 지운다.
import { describe, expect, it } from "vitest";

import { MAX_WON } from "@/lib/constants/interiorPlan";

import { isWonOnlyAmount, manwonInputTextOf } from "./manwonInputOfWon";

describe("manwonInputTextOf / isWonOnlyAmount", () => {
  it.each<[number | undefined, string, boolean]>([
    [10_000, "1", false],
    [20_000, "2", false],
    [12_000_000, "1200", false],
    [8_000_000, "800", false],
    [9_999_999_990_000, "999999999", false],
    [10_001, "", true],
    [9_999, "", true],
    [1_234_500, "", true],
    [999, "", true],
    [0, "", true],
    [MAX_WON, "", true],
    [undefined, "", false],
  ])("%s원 → 칸 %j, 안내 %s", (won, text, isWonOnly) => {
    expect(manwonInputTextOf(won)).toBe(text);
    expect(isWonOnlyAmount(won)).toBe(isWonOnly);
  });
});
