import { PLAN_BUDGET_MIN_WON } from "@/lib/constants/interiorPlan";
import { validateWonAmount } from "@/lib/utils/amount";
import { budgetMergePatch } from "@/lib/utils/budgetMergePatch";

import type { InteriorPlanPatch } from "@/lib/types/interiorPlan";

/** 계획 관리 시트의 칸 글자(이름 그대로, 총 예산은 쉼표를 뺀 원) */
export type PlanSettingsFields = { name: string; budget: string };

/**
 * 시트를 연 시점의 칸과 지금 칸 → 바뀐 칸만 담은 PATCH(ADR-034 조건 5). 고친 것이 없으면 `{}`이다(저장 버튼·닫기 확인도 이 값으로 본다).
 * - 이름이 바뀌면 앞뒤 공백을 뗀 `name`
 * - 총 예산 칸이 바뀌면 `budgetMergePatch`로 두 예산 키를 함께 정한다: 원 `budgetWon`(빈칸이면 null = 지움) + `budget: null`
 * 총 예산 칸을 건드리지 않으면 예산 키를 보내지 않아, 원 단위 `budgetWon`이나 옛 `budget`이 그대로 남는다.
 * 칸 검증은 부르는 쪽이 먼저 한다(오류인 예산 글자는 지움으로 읽히지 않게 저장 전에 막는다).
 */
export function planSettingsPatch(
  initial: PlanSettingsFields,
  current: PlanSettingsFields,
): InteriorPlanPatch {
  const budgetWon = validateWonAmount(current.budget, PLAN_BUDGET_MIN_WON);
  return {
    ...(current.name !== initial.name && { name: current.name.trim() }),
    ...(current.budget !== initial.budget &&
      budgetMergePatch({ budgetWon: budgetWon.status === "valid" ? budgetWon.value : null })),
  };
}
