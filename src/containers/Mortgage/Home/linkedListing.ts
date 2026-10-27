import type { Listing, ListingListState } from "@/lib/types/listing";

/**
 * 플랜에 연결된 매물의 지금 상태. none: 연결 없음, unknown: 매물 목록이 아직 확정 로드되지 않음(로딩·실패 — 판단하지 않는다),
 * linked: 지금 목록에 있음, missing: 목록에 없음(삭제·함께 쓰기에서 숨김, A8).
 */
export type LinkedListing =
  | { status: "none" }
  | { status: "unknown" }
  | { status: "linked"; listing: Listing }
  | { status: "missing" };

/** "연결된 매물이 삭제되었습니다"는 매물 목록이 확정 로드된(ok) 뒤에만 낸다(스펙 "화면 — 저장 목록 매물 카드") */
export function linkedListingOf(
  listingId: string | undefined,
  listings: ListingListState,
): LinkedListing {
  if (listingId === undefined) return { status: "none" };
  if (listings.status !== "ok") return { status: "unknown" };
  const listing = listings.listings.find((candidate) => candidate.id === listingId);
  return listing === undefined ? { status: "missing" } : { status: "linked", listing };
}
