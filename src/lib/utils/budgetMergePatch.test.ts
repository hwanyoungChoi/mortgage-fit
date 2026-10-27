// ADR-034 조건 4, qa Q6: 플랜 PATCH의 총 예산 두 키(`budget` 만원·`budgetWon` 원). 한 키를 쓰면 다른 키는 지우고,
// 둘 다 숫자면 거부, 이름만 고치면 예산 키를 건드리지 않는다. 순수 함수 표 + 로컬 저장소(`applyPlanPatch`) 끝에서 끝까지
// 같은 표(시작 상태 S0·S1·S2 × 입력)를 돌린다. 서버 쪽 같은 표는 `server/interiorPlans/interiorWonUnit.d1.test.ts`.
import { describe, expect, it } from "vitest";

import { P_SPACES, pTime, toStoredPlans } from "@/test/interiorPlanFixture";
import { createMemoryStorage } from "@/test/memoryStorage";

import { budgetMergePatch } from "./budgetMergePatch";
import { createInteriorPlanStore, INTERIOR_PLANS_STORAGE_KEY } from "./interiorPlanStorage";

import type { BudgetPatch } from "./budgetMergePatch";
import type { InteriorPlanPatch, InteriorPlanWithItems } from "@/lib/types/interiorPlan";

describe("budgetMergePatch — 입력 → merge patch", () => {
  const CASES: [string, BudgetPatch, BudgetPatch | null][] = [
    ["예산 키 없음(이름만)", {}, {}],
    ["budget 숫자", { budget: 500 }, { budget: 500, budgetWon: null }],
    ["budget null", { budget: null }, { budget: null, budgetWon: null }],
    ["budgetWon 숫자", { budgetWon: 5_000_000 }, { budget: null, budgetWon: 5_000_000 }],
    ["budgetWon null", { budgetWon: null }, { budget: null, budgetWon: null }],
    [
      "budget 숫자 + budgetWon null",
      { budget: 500, budgetWon: null },
      { budget: 500, budgetWon: null },
    ],
    [
      "budgetWon 숫자 + budget null",
      { budget: null, budgetWon: 5_000_000 },
      { budget: null, budgetWon: 5_000_000 },
    ],
    ["둘 다 null", { budget: null, budgetWon: null }, { budget: null, budgetWon: null }],
    ["둘 다 숫자 → 거부", { budget: 500, budgetWon: 12_345_000 }, null],
    ["둘 다 숫자(같은 환산값) → 거부", { budget: 500, budgetWon: 5_000_000 }, null],
    ["둘 다 0 → 거부(0도 숫자)", { budget: 0, budgetWon: 0 }, null],
    ["undefined는 키 없음", { budget: undefined, budgetWon: 1 }, { budget: null, budgetWon: 1 }],
  ];

  it.each(CASES)("%s", (_, input, expected) => {
    expect(budgetMergePatch(input)).toStrictEqual(expected);
  });

  it("다른 키(name 등)는 결과에 담지 않는다(부르는 쪽이 펼쳐 합친다)", () => {
    const patch: InteriorPlanPatch = { name: "새 이름", budget: 500, listingId: null };
    expect(budgetMergePatch(patch)).toStrictEqual({ budget: 500, budgetWon: null });
  });
});

describe("로컬 updatePlan — 시작 상태 × 입력 매트릭스(qa Q6), 원문에 지운 키가 없음", () => {
  type Budgets = Pick<InteriorPlanWithItems, "budget" | "budgetWon">;

  const STATES: [string, Budgets][] = [
    ["S0(예산 없음)", {}],
    ["S1 { budget: 1000 }", { budget: 1000 }],
    ["S2 { budgetWon: 12345000 }", { budgetWon: 12_345_000 }],
  ];

  /** 입력과 기대 결과(예산 키). "keep"은 시작 상태 그대로, "invalid"는 거부(원문 그대로) */
  const INPUTS: [string, InteriorPlanPatch, Budgets | "keep" | "invalid"][] = [
    ["{ budget: 500 }", { budget: 500 }, { budget: 500 }],
    ["{ budget: null }", { budget: null }, {}],
    ["{ budgetWon: 5000000 }", { budgetWon: 5_000_000 }, { budgetWon: 5_000_000 }],
    ["{ budgetWon: null }", { budgetWon: null }, {}],
    ['{ name: "새 이름" }만', { name: "새 이름" }, "keep"],
    ["{ budget: 500, budgetWon: 5000000 }", { budget: 500, budgetWon: 5_000_000 }, "invalid"],
    ["{ budget: 500, budgetWon: null }", { budget: 500, budgetWon: null }, { budget: 500 }],
    [
      "{ budget: null, budgetWon: 5000000 }",
      { budget: null, budgetWon: 5_000_000 },
      { budgetWon: 5_000_000 },
    ],
    ["{ budgetWon: 0 }", { budgetWon: 0 }, "invalid"],
    ["{ budgetWon: 10_000_000_000_000 }", { budgetWon: 10_000_000_000_000 }, "invalid"],
    ['{ budgetWon: "1" }', { budgetWon: "1" as unknown as number }, "invalid"],
  ];

  const planWith = (budgets: Budgets): InteriorPlanWithItems => ({
    id: "plan-x",
    name: "우리 집",
    ...budgets,
    spaces: P_SPACES.slice(0, 1),
    createdAt: pTime(0),
    updatedAt: pTime(0),
    items: [],
  });

  const MATRIX = STATES.flatMap(([stateLabel, state]) =>
    INPUTS.map(
      ([inputLabel, input, expected]) => [stateLabel, inputLabel, state, input, expected] as const,
    ),
  );

  it.each(MATRIX)("%s × %s", (_, __, state, input, expected) => {
    const storage = createMemoryStorage({
      [INTERIOR_PLANS_STORAGE_KEY]: toStoredPlans([planWith(state)]),
    });
    const before = storage.getItem(INTERIOR_PLANS_STORAGE_KEY);
    const store = createInteriorPlanStore({ storage, createId: () => "id", now: () => pTime(30) });

    const result = store.updatePlan("plan-x", input);

    if (expected === "invalid") {
      expect(result).toStrictEqual({ ok: false, reason: "invalid" });
      expect(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)).toBe(before);
      return;
    }
    expect(result).toStrictEqual({ ok: true });
    const [stored] = (
      JSON.parse(storage.getItem(INTERIOR_PLANS_STORAGE_KEY)!) as {
        plans: Record<string, unknown>[];
      }
    ).plans;
    const budgets = expected === "keep" ? state : expected;
    expect(stored).toStrictEqual({
      id: "plan-x",
      name: input.name ?? "우리 집",
      ...budgets,
      spaces: P_SPACES.slice(0, 1),
      createdAt: pTime(0),
      updatedAt: pTime(30),
      items: [],
    });
    expect(Object.hasOwn(stored, "budget")).toBe(budgets.budget !== undefined);
    expect(Object.hasOwn(stored, "budgetWon")).toBe(budgets.budgetWon !== undefined);
  });
});
