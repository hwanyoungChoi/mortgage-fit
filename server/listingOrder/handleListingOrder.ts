// 로그인 사용자의 계정 직접 정렬 순서(ADR-026, `users.listing_order` JSON 문자열). 값 검증은 `isListingOrder`.
// 함께 쓰는 중이면 가구 순서(`households.listing_order`)를 읽고 쓴다(ADR-028). 대상 선택은 householdScope 한 곳.
import { isListingOrder } from "../../src/lib/utils/isListingOrder";
import { readSharedValue, writeSharedValue } from "../household/householdScope";
import { readJsonBody } from "../http/readJsonBody";
import { errorResponse, jsonResponse } from "../http/response";

import type { ImportListingOrderResponse, ListingOrderResponse } from "../../src/lib/types/account";

/** 최악 500 × (id 64자 + 따옴표 2 + 쉼표 1) ≈ 33.5KB에 여유를 둔다. */
const LISTING_ORDER_MAX_BYTES = 64 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

const invalidListingOrder = (message: string) => errorResponse(400, "invalidParams", message);

function readIdsField(value: unknown): unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>).ids
    : undefined;
}

/** 서버가 검증해서 쓴 값만 들어 있으므로 다시 검증하지 않는다. */
const parseStoredOrder = (stored: string | null): string[] | null =>
  stored === null ? null : (JSON.parse(stored) as string[]);

/** GET /api/listing-order → 200 `{ ids }`, 없으면 null */
export async function getListingOrder(db: D1Database, userId: string): Promise<Response> {
  const stored = await readSharedValue<string>(db, userId, "listing_order");
  const body: ListingOrderResponse = { ids: parseStoredOrder(stored) };
  return jsonResponse(200, body, NO_STORE);
}

/** PUT /api/listing-order `{ ids: string[] | null }`. null이면 지운다. 응답은 저장된 값 */
export async function putListingOrder(
  request: Request,
  db: D1Database,
  userId: string,
): Promise<Response> {
  const body = await readJsonBody(request, LISTING_ORDER_MAX_BYTES);
  if (!body.ok) return body.response;
  const ids = readIdsField(body.value);
  if (ids !== null && !isListingOrder(ids)) {
    return invalidListingOrder(
      "요청 본문은 { ids } 객체이고 중복 없는 매물 id 0~500개 배열 또는 null이어야 합니다",
    );
  }

  await writeSharedValue(
    db,
    userId,
    "listing_order",
    "?2",
    ids === null ? null : JSON.stringify(ids),
  );
  const response: ListingOrderResponse = { ids };
  return jsonResponse(200, response, NO_STORE);
}

/**
 * POST /api/listing-order/import `{ ids: string[] }`. 계정(가구) 순서가 비어 있을 때만 채운다.
 * 한 문장 UPDATE라 두 기기가 동시에 첫 로그인해도 먼저 온 값 하나만 남는다. 응답은 계정의 현재 값
 */
export async function importListingOrder(
  request: Request,
  db: D1Database,
  userId: string,
): Promise<Response> {
  const body = await readJsonBody(request, LISTING_ORDER_MAX_BYTES);
  if (!body.ok) return body.response;
  const ids = readIdsField(body.value);
  if (!isListingOrder(ids)) {
    return invalidListingOrder(
      "요청 본문은 { ids } 객체이고 중복 없는 매물 id 0~500개 배열이어야 합니다",
    );
  }

  const stored = await writeSharedValue<string>(
    db,
    userId,
    "listing_order",
    "COALESCE(listing_order, ?2)",
    JSON.stringify(ids),
  );
  // 세션이 있으면 users 행도 있다(sessions → users FK). 없으면 라우터가 500으로 바꾼다.
  if (stored === undefined || stored === null) throw new Error("users row missing");
  const response: ImportListingOrderResponse = { ids: JSON.parse(stored) as string[] };
  return jsonResponse(200, response, NO_STORE);
}
