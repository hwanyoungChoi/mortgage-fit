// 스펙 interior-planner AC-6·U7: 매물 추가 비용 → 플랜 만들기 항목(1회 복사).
// 인테리어 분류 줄만, 입력 순서 그대로, 줄 이름 → 공종(자르지 않음), 금액 → 예산, 상태 계획, 공간은 넘겨준 id("전체").
import { describe, expect, it } from "vitest";

import { EXTRA_COST_LABEL_MAX_LENGTH, EXTRA_COST_MAX_ITEMS } from "@/lib/constants/extraCosts";
import {
  INTERIOR_PLAN_CREATE_MAX_ITEMS,
  INTERIOR_TRADE_MAX_LENGTH,
} from "@/lib/constants/interiorPlan";
import { MAX_AMOUNT } from "@/lib/utils/amount";

import { extraCostsToInteriorItems, interiorExtraCostsOf } from "./extraCostsToInteriorItems";
import { validateInteriorItemFields } from "./validateInteriorPlan";
import { validateExtraCostLabel } from "./validateListingFields";

import type { ExtraCost, ExtraCostCategory } from "@/lib/types/extraCost";

const WHOLE_SPACE_ID = "0123456789abcdef0123456789abcdef";

const line = (category: ExtraCostCategory, label: string, amount: number): ExtraCost => ({
  category,
  label,
  amount,
});

/** AC-6 예시 매물 "래미안 84"의 추가 비용 */
const RAEMIAN_EXTRA_COSTS: ExtraCost[] = [
  line("interior", "도배", 300),
  line("interior", "샷시", 1200),
  line("appliance", "냉장고", 400),
];

describe("interiorExtraCostsOf", () => {
  it("인자가 없으면(매물에 추가 비용 키 없음) 빈 배열", () => {
    expect(interiorExtraCostsOf()).toEqual([]);
    expect(interiorExtraCostsOf(undefined)).toEqual([]);
  });

  it("빈 배열이면 빈 배열", () => {
    expect(interiorExtraCostsOf([])).toEqual([]);
  });

  it("인테리어 줄만, 입력 순서 그대로(만들기 시트의 'n줄'이 이 길이)", () => {
    expect(interiorExtraCostsOf(RAEMIAN_EXTRA_COSTS)).toEqual([
      line("interior", "도배", 300),
      line("interior", "샷시", 1200),
    ]);
  });
});

describe("extraCostsToInteriorItems (AC-6·U7)", () => {
  it("undefined → 빈 배열", () => {
    expect(extraCostsToInteriorItems(undefined, WHOLE_SPACE_ID)).toEqual([]);
  });

  it("인테리어 줄 0개: 빈 배열 · 다른 분류만 있어도 빈 배열", () => {
    expect(extraCostsToInteriorItems([], WHOLE_SPACE_ID)).toEqual([]);
    expect(
      extraCostsToInteriorItems(
        [
          line("appliance", "냉장고", 400),
          line("furniture", "소파", 200),
          line("moving", "이사", 150),
          line("other", "중개 수수료", 90),
        ],
        WHOLE_SPACE_ID,
      ),
    ).toEqual([]);
  });

  it("인테리어 줄 1개: 공간·공종·예산·상태 계획만 담는다(다른 키 없음)", () => {
    expect(extraCostsToInteriorItems([line("interior", "도배", 300)], WHOLE_SPACE_ID)).toEqual([
      { spaceId: WHOLE_SPACE_ID, trade: "도배", budget: 300, status: "planned" },
    ]);
  });

  it("AC-6 예시: 도배 300·샷시 1,200만 들어가고 냉장고(가전)는 없다, 합계 1,500", () => {
    const items = extraCostsToInteriorItems(RAEMIAN_EXTRA_COSTS, WHOLE_SPACE_ID);
    expect(items).toEqual([
      { spaceId: WHOLE_SPACE_ID, trade: "도배", budget: 300, status: "planned" },
      { spaceId: WHOLE_SPACE_ID, trade: "샷시", budget: 1200, status: "planned" },
    ]);
    expect(items.reduce((sum, item) => sum + (item.budget ?? 0), 0)).toBe(1500);
  });

  it("섞인 분류: 가전·가구·이사·기타 사이에 끼인 인테리어 줄도 입력 순서대로만 남는다", () => {
    const items = extraCostsToInteriorItems(
      [
        line("appliance", "냉장고", 400),
        line("interior", "필름", 120),
        line("furniture", "식탁", 80),
        line("interior", "도배", 300),
        line("moving", "포장 이사", 150),
        line("other", "청소", 40),
        line("interior", "바닥", 500),
      ],
      WHOLE_SPACE_ID,
    );
    expect(items.map((item) => [item.trade, item.budget])).toEqual([
      ["필름", 120],
      ["도배", 300],
      ["바닥", 500],
    ]);
  });

  it("같은 이름 줄이 둘이어도 합치지 않고 둘 다 넣는다", () => {
    const items = extraCostsToInteriorItems(
      [line("interior", "도배", 100), line("interior", "도배", 200)],
      WHOLE_SPACE_ID,
    );
    expect(items.map((item) => item.budget)).toEqual([100, 200]);
  });

  it("인테리어 줄 30개(매물 추가 비용 상한): 30개 모두, 입력 순서, 만들기 POST items 상한 30과 같다", () => {
    expect(EXTRA_COST_MAX_ITEMS).toBe(30);
    expect(INTERIOR_PLAN_CREATE_MAX_ITEMS).toBe(EXTRA_COST_MAX_ITEMS);
    const extraCosts = Array.from({ length: 30 }, (_, index) =>
      line("interior", `공종${index + 1}`, index + 1),
    );
    const items = extraCostsToInteriorItems(extraCosts, WHOLE_SPACE_ID);
    expect(items).toHaveLength(30);
    expect(items.map((item) => item.trade)).toEqual(extraCosts.map((cost) => cost.label));
    expect(items.map((item) => item.budget)).toEqual(extraCosts.map((cost) => cost.amount));
    for (const item of items) expect(validateInteriorItemFields(item)).toEqual(item);
  });

  it("줄 이름 30자(한글·코드포인트 기준)는 자르지 않고 그대로 공종이 되고, 항목 검증을 통과한다", () => {
    expect(INTERIOR_TRADE_MAX_LENGTH).toBe(EXTRA_COST_LABEL_MAX_LENGTH);
    expect(INTERIOR_TRADE_MAX_LENGTH).toBe(30);
    const hangul30 = "가".repeat(30);
    // 이모지는 UTF-16 길이 2인 코드포인트: 코드포인트 30개, `.length` 60
    const emoji30 = "🏠".repeat(30);
    for (const label of [hangul30, emoji30]) {
      // 매물 쪽에서도 저장되는 이름이다
      expect(validateExtraCostLabel(label)).toMatchObject({ ok: true, label });
      const [item] = extraCostsToInteriorItems([line("interior", label, 300)], WHOLE_SPACE_ID);
      expect(item.trade).toBe(label);
      expect(validateInteriorItemFields(item)).toEqual(item);
    }
    // 경계 바깥: 31자 공종은 항목 검증에서 막힌다(상한이 같으므로 매물 줄 이름은 여기에 닿지 않는다)
    const [tooLong] = extraCostsToInteriorItems(
      [line("interior", "가".repeat(31), 300)],
      WHOLE_SPACE_ID,
    );
    expect(tooLong.trade).toBe("가".repeat(31));
    expect(validateInteriorItemFields(tooLong)).toBeNull();
  });

  it("금액은 그대로 예산이 된다: 1, 1,500, 상한 999,999,999", () => {
    const items = extraCostsToInteriorItems(
      [line("interior", "a", 1), line("interior", "b", 1500), line("interior", "c", MAX_AMOUNT)],
      WHOLE_SPACE_ID,
    );
    expect(MAX_AMOUNT).toBe(999_999_999);
    expect(items.map((item) => item.budget)).toEqual([1, 1500, 999_999_999]);
    for (const item of items) expect(validateInteriorItemFields(item)).toEqual(item);
  });

  it("넘겨준 공간 id를 모든 항목에 쓴다", () => {
    const items = extraCostsToInteriorItems(RAEMIAN_EXTRA_COSTS, "space-whole");
    expect(items.map((item) => item.spaceId)).toEqual(["space-whole", "space-whole"]);
  });

  it("1회 복사: 입력 배열을 바꾸지 않고, 결과를 고쳐도 매물 추가 비용은 그대로", () => {
    const extraCosts = structuredClone(RAEMIAN_EXTRA_COSTS);
    const before = JSON.stringify(extraCosts);
    const items = extraCostsToInteriorItems(extraCosts, WHOLE_SPACE_ID);
    items[0].trade = "바뀜";
    items[0].budget = 1;
    expect(JSON.stringify(extraCosts)).toBe(before);
  });
});
