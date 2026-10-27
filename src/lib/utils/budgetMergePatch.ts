// 플랜 PATCH의 총 예산 두 키(`budget` 만원·`budgetWon` 원)를 함께 정하는 규칙의 원본(ADR-034 조건 4).
// 서버 `parsePlanPatchRequest`와 로컬 `applyPlanPatch`가 같이 쓴다. 서버 PATCH는 `json_patch` 뒤 다시 검증하지 않으므로
// 같은 뜻의 두 키가 함께 남지 않게 하는 곳은 여기 하나다. worker 프로젝트에서도 타입 검사를 통과하도록 `@/` 별칭을 쓰지 않는다.
import type { InteriorPlanPatch } from "../types/interiorPlan";

export type BudgetPatch = Pick<InteriorPlanPatch, "budget" | "budgetWon">;

/**
 * PATCH의 예산 키(undefined = 키 없음)를 merge patch로 바꾼다. 값의 범위는 보지 않는다(서버는 키마다, 로컬은 병합 뒤 검증).
 * - 둘 다 없음 → `{}`(예산 키를 건드리지 않는다. 이름만 고치는 요청)
 * - 하나라도 있음 → 두 키를 함께 정한다. 보낸 숫자는 그 값, 나머지는 null(지움). 예: `{ budget: 500 }` → `{ budget: 500, budgetWon: null }`
 * - 둘 다 숫자 → null(거부. 어느 쪽도 고르지 않는다)
 */
export function budgetMergePatch({ budget, budgetWon }: BudgetPatch): BudgetPatch | null {
  if (budget === undefined && budgetWon === undefined) return {};
  if (typeof budget === "number" && typeof budgetWon === "number") return null;
  return { budget: budget ?? null, budgetWon: budgetWon ?? null };
}
