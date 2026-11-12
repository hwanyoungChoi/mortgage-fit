import type { BudgetState } from "@/lib/types/budget";
import type { ListingListState } from "@/lib/types/listing";
import type { ListingOrderState } from "@/lib/types/listingOrder";

/**
 * 저장 목록 본문을 아직 드러내지 않는다(ADR-041 "한 화면은 한 번에"). 목록이 로딩이거나, 매물이 있는데 예산·직접 정한
 * 순서 중 하나라도 로딩이면 본문 전체가 스켈레톤이다. 매물이 없거나 목록을 읽지 못했으면 예산·순서는 화면에 쓰이지 않아
 * 기다리지 않는다. 실패는 로딩이 아니다(드러낸 뒤 그 자리에 문구와 [다시 시도]).
 */
export function isListingsLoading(
  list: ListingListState,
  budget: BudgetState,
  order: ListingOrderState,
): boolean {
  if (list.status === "loading") return true;
  if (list.status !== "ok" || list.listings.length === 0) return false;
  return budget.status === "loading" || order.status === "loading";
}
