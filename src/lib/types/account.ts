// /api/me, /api/listings 계약(스펙 account-sync-share "태스크 2"), /api/budget 계약(스펙 sort-order-budget-sync), /api/listing-order 계약(ADR-026). 응답의 `Listing`은 로컬 타입 그대로다.
import type { Household } from "./household";
import type { Listing, ListingInput, ListingStatus } from "./listing";

/**
 * GET /api/me → 200. 로그인 안 했으면 `user`가 null이다. `id`는 내부 id(카카오 회원번호 아님).
 * `household`는 함께 쓰는 목록에 있으면 인원, 혼자 쓰면 null(스펙 shared-list).
 */
export type MeResponse = { user: { id: string; household: Household | null } | null };

/** GET /api/listings → 200 */
export type ListingListResponse = { listings: Listing[] };

/** POST /api/listings, PUT /api/listings/{id} 요청. PUT은 `memo`·`status` 키를 읽지 않는다(기존 값 유지). */
export type ListingRequest = { listing: ListingInput };

/** PATCH /api/listings/{id} 요청. 빈 문자열이면 메모를 지운다. `ListingStatusRequest`와 한 본문에 함께 보낼 수 있다. */
export type ListingMemoRequest = { memo: string };

/** PATCH /api/listings/{id} 요청(ADR-027). null이면 상태를 지운다(미지정). */
export type ListingStatusRequest = { status: ListingStatus | null };

/** PATCH /api/listings/{id} 요청. 앞뒤 공백을 빼고 1~40자, 지울 수 없다(null 불가). memo·status와 함께 보낼 수 있다. */
export type ListingNameRequest = { name: string };

/** POST(201)·PUT·PATCH(200) /api/listings 응답 */
export type ListingResponse = { listing: Listing };

/** POST /api/listings/import 요청. 1~100개, id·시각 포함 */
export type ImportListingsRequest = { listings: Listing[] };

/** POST /api/listings/import → 200 */
export type ImportListingsResponse = { imported: number; skipped: number };

/** GET·PUT /api/budget → 200. 계정 예산(만원), 없으면 null */
export type BudgetResponse = { budget: number | null };

/** PUT /api/budget 요청. 1~999,999,999 정수, null이면 지운다. */
export type BudgetRequest = { budget: number | null };

/** POST /api/budget/import 요청. 계정 예산이 비어 있을 때만 채운다(null 불가). */
export type ImportBudgetRequest = { budget: number };

/** POST /api/budget/import → 200. 계정의 현재 값(비어 있었으면 보낸 값, 아니면 기존 값) */
export type ImportBudgetResponse = { budget: number };

/** GET·PUT /api/listing-order → 200. 계정의 직접 정렬 순서(매물 id), 없으면 null */
export type ListingOrderResponse = { ids: string[] | null };

/** PUT /api/listing-order 요청. 0~500개, 중복 없는 매물 id. null이면 지운다. */
export type ListingOrderRequest = { ids: string[] | null };

/** POST /api/listing-order/import 요청. 계정 순서가 비어 있을 때만 채운다(null 불가). */
export type ImportListingOrderRequest = { ids: string[] };

/** POST /api/listing-order/import → 200. 계정의 현재 값(비어 있었으면 보낸 값, 아니면 기존 값) */
export type ImportListingOrderResponse = { ids: string[] };
