// ADR-034 조건 4·5(fe 4, qa Q6·Q9): 계획 관리 시트는 바뀐 칸만 보낸다. 총 예산 칸을 바꾸면 `budgetMergePatch`로
// 만원 `budget` + `budgetWon: null`, 건드리지 않으면 예산 키가 없다(원 단위 총 예산이 이름 변경으로 지워지지 않게).
// 키가 없어야 하는 결과는 toStrictEqual·Object.hasOwn으로 본다.
import { describe, expect, it } from "vitest";

import { planSettingsPatch } from "./planSettingsPatch";

import type { PlanSettingsFields } from "./planSettingsPatch";
import type { InteriorPlanPatch } from "@/lib/types/interiorPlan";

const OPENED: PlanSettingsFields = { name: "우리 집", budget: "1000" };
/** 원 단위 총 예산(12,345,000원)이라 예산 칸이 빈칸으로 열린 시트 */
const OPENED_WON_ONLY: PlanSettingsFields = { name: "우리 집", budget: "" };

describe("planSettingsPatch", () => {
  it.each<[string, PlanSettingsFields, PlanSettingsFields, InteriorPlanPatch]>([
    ["고친 것 없음 → {}", OPENED, OPENED, {}],
    ["이름만 → name만(예산 키 없음)", OPENED, { ...OPENED, name: "새 이름" }, { name: "새 이름" }],
    ["이름 앞뒤 공백은 뗀다", OPENED, { ...OPENED, name: "  새 이름 " }, { name: "새 이름" }],
    [
      "예산만 → budget + budgetWon: null",
      OPENED,
      { ...OPENED, budget: "500" },
      { budget: 500, budgetWon: null },
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
      { name: "새 이름", budget: "500" },
      { name: "새 이름", budget: 500, budgetWon: null },
    ],
    [
      "원 단위로 빈칸으로 연 시트에서 이름만 → name만",
      OPENED_WON_ONLY,
      { ...OPENED_WON_ONLY, name: "새 이름" },
      { name: "새 이름" },
    ],
    [
      "원 단위로 빈칸으로 연 시트에서 예산을 만원으로 다시 입력 → budget + budgetWon: null",
      OPENED_WON_ONLY,
      { ...OPENED_WON_ONLY, budget: "1234" },
      { budget: 1234, budgetWon: null },
    ],
  ])("%s", (_, initial, current, expected) => {
    const patch = planSettingsPatch(initial, current);
    expect(patch).toStrictEqual(expected);
    expect(Object.hasOwn(patch, "budget")).toBe(Object.hasOwn(expected, "budget"));
    expect(Object.hasOwn(patch, "budgetWon")).toBe(Object.hasOwn(expected, "budgetWon"));
  });
});
