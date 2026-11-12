import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";
import type { InteriorPlanListState } from "@/lib/types/interiorPlanStore";
import type { ListingListState } from "@/lib/types/listing";

/** 열 계획이 매물에 연결돼 있다. 드러내면 계획 머리글 아래 "연결된 매물" 줄이 생긴다 */
export function isLinkedPlan(plan: Pick<InteriorPlanWithItems, "listingId"> | null): boolean {
  return plan?.listingId !== undefined;
}

/**
 * 예산 본문을 아직 드러내지 않는다(ADR-041 "한 화면은 한 번에"). 계획 목록이 로딩이거나, 열 계획이 매물에 연결돼 있는데
 * 매물 목록이 로딩이면 스켈레톤이다(연결된 매물 줄이 늦게 끼어들지 않게). 실패는 로딩이 아니다.
 */
export function isHomeLoading(
  plans: InteriorPlanListState,
  currentPlan: Pick<InteriorPlanWithItems, "listingId"> | null,
  listings: ListingListState,
): boolean {
  if (plans.status === "loading") return true;
  return isLinkedPlan(currentPlan) && listings.status === "loading";
}
