import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";

/**
 * 같은 항목 동시 편집(스펙 "동기화·이전 규칙", ADR-029 조건 8). 시트를 연 시점의 `updatedAt`과 저장 직전 목록의 `updatedAt`이
 * 다르면 그 사이 다른 사람(다른 기기·탭)이 저장한 것이다. 항목이 없으면(지워짐) 충돌로 보지 않고 쓰기가 notFound로 알린다.
 */
export function isInteriorItemEditConflict(
  plans: InteriorPlanWithItems[],
  planId: string,
  itemId: string,
  openedUpdatedAt: string,
): boolean {
  const plan = plans.find((candidate) => candidate.id === planId);
  const item = plan?.items.find((candidate) => candidate.id === itemId);
  return item !== undefined && item.updatedAt !== openedUpdatedAt;
}
