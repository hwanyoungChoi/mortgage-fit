import { INTERIOR_PLAN_MAX_COUNT } from "@/lib/constants/interiorPlan";

import type { InteriorPlanWithItems } from "@/lib/types/interiorPlan";
import type { Listing, ListingListState } from "@/lib/types/listing";

type ListingEntryNotice = "listingMissing" | "listingsUnavailable" | "planLimit";

/**
 * 매물 카드에서 들어온 길(`#/home?listing={id}`)에서 할 일. 계획 목록이 정해진(ok) 뒤에 부른다.
 * wait: 매물 목록을 아직 불러오는 중, openPlan: 그 매물에 연결된 계획(여럿이면 첫 번째)으로 replace,
 * create: 그 매물로 채운 만들기 시트, notice: 만들 수 없어 이유만 알린다.
 */
export type ListingEntry =
  | { action: "wait" }
  | { action: "openPlan"; planId: string }
  | { action: "create"; listing: Listing }
  | { action: "notice"; reason: ListingEntryNotice };

export const LISTING_ENTRY_NOTICES: Record<ListingEntryNotice, string> = {
  listingMissing:
    "매물을 찾지 못해 계획 만들기를 열지 않았습니다. 삭제되었거나 지금 목록에서 볼 수 없는 매물입니다",
  listingsUnavailable:
    "저장 목록을 불러오지 못해 매물에서 계획을 만들 수 없습니다. 저장 목록을 확인해 주세요",
  planLimit: `계획은 ${INTERIOR_PLAN_MAX_COUNT}개까지 만들 수 있어 이 매물의 계획을 새로 만들지 못했습니다`,
};

/**
 * 연결된 계획 찾기는 계획 목록만 본다(매물 목록을 기다리지 않는다). 연결 계획이 없을 때만 매물 목록에서 그 매물을 찾는다.
 * 매물이 없으면(삭제·함께 쓰기에서 숨김) 빈 만들기 시트를 열지 않는다(매물 없는 계획이 몰래 생기지 않게).
 */
export function resolveListingEntry(
  listingId: string,
  plans: InteriorPlanWithItems[],
  listings: ListingListState,
): ListingEntry {
  const linkedPlan = plans.find((plan) => plan.listingId === listingId);
  if (linkedPlan !== undefined) return { action: "openPlan", planId: linkedPlan.id };
  if (listings.status === "loading") return { action: "wait" };
  if (listings.status !== "ok") return { action: "notice", reason: "listingsUnavailable" };
  const listing = listings.listings.find((candidate) => candidate.id === listingId);
  if (listing === undefined) return { action: "notice", reason: "listingMissing" };
  if (plans.length >= INTERIOR_PLAN_MAX_COUNT) return { action: "notice", reason: "planLimit" };
  return { action: "create", listing };
}
