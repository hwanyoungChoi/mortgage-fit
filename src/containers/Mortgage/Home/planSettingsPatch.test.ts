// ADR-034 조건 4·5(fe 4, qa Q6·Q9): 계획 관리 시트는 바뀐 칸만 보낸다. 총 예산 칸(2단계 원 입력)을 바꾸면 `budgetMergePatch`로
// 원 `budgetWon` + `budget: null`, 건드리지 않으면 예산 키가 없다(옛 만원 `budget`이 이름 변경으로 다시 쓰이지 않게).
// 키가 없어야 하는 결과는 toStrictEqual·Object.hasOwn으로 본다.
import { describe, expect, it } from "vitest";

import { planSettingsPatch } from "./planSettingsPatch";

import type { PlanSettingsFields } from "./planSettingsPatch";
import type { InteriorPlanPatch } from "@/lib/types/interiorPlan";

/** 총 예산 1,000만원(옛 `budget: 1000`이든 `budgetWon: 10000000`이든 원 글자로 열린다) */
const OPENED: PlanSettingsFields = { name: "우리 집", budget: "10000000" };
/** 총 예산 없이 열린 시트 */
const OPENED_EMPTY: PlanSettingsFields = { name: "우리 집", budget: "" };

describe("planSettingsPatch", () => {
  it.each<[string, PlanSettingsFields, PlanSettingsFields, InteriorPlanPatch]>([
    ["고친 것 없음 → {}", OPENED, OPENED, {}],
    ["이름만 → name만(예산 키 없음)", OPENED, { ...OPENED, name: "새 이름" }, { name: "새 이름" }],
    ["이름 앞뒤 공백은 뗀다", OPENED, { ...OPENED, name: "  새 이름 " }, { name: "새 이름" }],
    [
      "예산만 → budgetWon + budget: null",
      OPENED,
      { ...OPENED, budget: "12345000" },
      { budget: null, budgetWon: 12_345_000 },
    ],
    [
      "예산을 비우면 두 키 모두 null(지움)",
      OPENED,
      { ...OPENED, budget: "" },
      { budget: null, budgetWon: null },
    ],
    [
      "이름과 예산 둘 다",
      OPENED,
      { name: "새 이름", budget: "12345000" },
      { name: "새 이름", budget: null, budgetWon: 12_345_000 },
    ],
    [
      "총 예산 없이 연 시트에서 이름만 → name만",
      OPENED_EMPTY,
      { ...OPENED_EMPTY, name: "새 이름" },
      { name: "새 이름" },
    ],
    [
      "총 예산 없이 연 시트에서 1원 입력 → budgetWon 1 + budget: null",
      OPENED_EMPTY,
      { ...OPENED_EMPTY, budget: "1" },
      { budget: null, budgetWon: 1 },
    ],
    [
      "쉼표 붙여넣기도 원 정수",
      OPENED_EMPTY,
      { ...OPENED_EMPTY, budget: "9,999,999,999,999" },
      { budget: null, budgetWon: 9_999_999_999_999 },
    ],
  ])("%s", (_, initial, current, expected) => {
    const patch = planSettingsPatch(initial, current);
    expect(patch).toStrictEqual(expected);
    expect(Object.hasOwn(patch, "budget")).toBe(Object.hasOwn(expected, "budget"));
    expect(Object.hasOwn(patch, "budgetWon")).toBe(Object.hasOwn(expected, "budgetWon"));
  });
});
