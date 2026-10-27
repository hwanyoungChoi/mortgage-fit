// /api/interior-plans 본문 검증. 플랜·항목 규칙은 로컬 저장소와 같은 공용 검증(`validateInteriorPlan.ts`)을 쓰고,
// 여기에는 서버 경계만 둔다: 봉투(`{ plan }`·`{ item }`), PATCH 부분 검증, 개수 상한, import 항목 id 유일성.
// 공용 함수가 알려진 키만 담은 새 객체를 돌려주므로 저장 값에 모르는 키가 들어가지 않는다(ADR-029 조건 2).
import {
  INTERIOR_ITEM_MAX_COUNT,
  INTERIOR_PLAN_CREATE_MAX_ITEMS,
} from "../../src/lib/constants/interiorPlan";
import {
  isInteriorAmount,
  parseInteriorItem,
  parseInteriorPlan,
  parseInteriorPlanName,
  parseInteriorSpaces,
  validateInteriorItemFields,
  validateInteriorPlanFields,
} from "../../src/lib/utils/validateInteriorPlan";
import { isListingId } from "../../src/lib/utils/validateListingFields";

import type {
  InteriorItem,
  InteriorItemInput,
  InteriorPlan,
  InteriorPlanInput,
  InteriorPlanPatch,
} from "../../src/lib/types/interiorPlan";

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** POST 본문: 플랜 필드 + 함께 넣을 항목 필드(id·시각 없음) */
export type PlanCreate = { plan: InteriorPlanInput; items: InteriorItemInput[] };

/** POST /api/interior-plans 본문 `{ plan: { name, budget?, listingId?, spaces, items? } }`. items는 0~30개 */
export function parsePlanCreateRequest(value: unknown): Parsed<PlanCreate> {
  const raw = isRecord(value) ? value.plan : undefined;
  const plan = validateInteriorPlanFields(raw);
  if (plan === null || !isRecord(raw)) {
    return { ok: false, message: "요청 본문은 { plan } 객체이고 플랜 값이 올바라야 합니다" };
  }
  const rawItems = Object.hasOwn(raw, "items") ? raw.items : [];
  if (!Array.isArray(rawItems) || rawItems.length > INTERIOR_PLAN_CREATE_MAX_ITEMS) {
    return {
      ok: false,
      message: `items는 ${INTERIOR_PLAN_CREATE_MAX_ITEMS}개 이하의 배열이어야 합니다`,
    };
  }
  const items: InteriorItemInput[] = [];
  for (const [index, rawItem] of (rawItems as unknown[]).entries()) {
    const item = validateInteriorItemFields(rawItem);
    if (item === null)
      return { ok: false, message: `${index + 1}번째 항목의 값이 올바르지 않습니다` };
    items.push(item);
  }
  return { ok: true, value: { plan, items } };
}

/**
 * PATCH 본문 `{ plan: { name?, budget?, listingId?, spaces? } }`를 `interior_plans.data`에 합칠 JSON Merge Patch(RFC 7396)로.
 * 키 없음 = 그대로, `budget`·`listingId`의 null = 지움. 이름·공간은 지울 수 없다. 알려진 키가 하나 이상 있어야 한다.
 */
export function parsePlanPatchRequest(value: unknown): Parsed<InteriorPlanPatch> {
  const raw = isRecord(value) ? value.plan : undefined;
  const has = (key: string) => isRecord(raw) && Object.hasOwn(raw, key);
  if (!isRecord(raw) || !["name", "budget", "listingId", "spaces"].some(has)) {
    return {
      ok: false,
      message:
        "요청 본문은 { plan } 객체이고 name, budget, listingId, spaces 중 하나 이상이 있어야 합니다",
    };
  }

  const patch: InteriorPlanPatch = {};
  if (has("name")) {
    const name = parseInteriorPlanName(raw.name);
    if (name === null) return { ok: false, message: "플랜 이름이 올바르지 않습니다" };
    patch.name = name;
  }
  if (has("budget")) {
    if (raw.budget !== null && !isInteriorAmount(raw.budget)) {
      return { ok: false, message: "budget은 1~999,999,999 정수(만원) 또는 null이어야 합니다" };
    }
    patch.budget = raw.budget;
  }
  if (has("listingId")) {
    if (raw.listingId !== null && !isListingId(raw.listingId)) {
      return { ok: false, message: "listingId 형식이 올바르지 않습니다" };
    }
    patch.listingId = raw.listingId;
  }
  if (has("spaces")) {
    const spaces = parseInteriorSpaces(raw.spaces);
    if (spaces === null) return { ok: false, message: "공간 목록이 올바르지 않습니다" };
    patch.spaces = spaces;
  }
  return { ok: true, value: patch };
}

/** 항목 POST·PUT 본문 `{ item }`(id·시각 없음, 있어도 읽지 않는다) */
export function parseItemRequest(value: unknown): Parsed<InteriorItemInput> {
  const item = isRecord(value) ? validateInteriorItemFields(value.item) : null;
  return item === null
    ? { ok: false, message: "요청 본문은 { item } 객체이고 항목 값이 올바라야 합니다" }
    : { ok: true, value: item };
}

/** import 한 건: 플랜과 항목을 id·시각 그대로 */
export type PlanImport = { plan: InteriorPlan; items: InteriorItem[] };

/** POST /api/interior-plans/import 본문 `{ plan: InteriorPlan & { items } }`. 항목 0~100개, 항목 id 유일 */
export function parsePlanImportRequest(value: unknown): Parsed<PlanImport> {
  const raw = isRecord(value) ? value.plan : undefined;
  const plan = parseInteriorPlan(raw);
  if (plan === null || !isRecord(raw)) {
    return { ok: false, message: "요청 본문은 { plan } 객체이고 플랜 값이 올바라야 합니다" };
  }
  if (!Array.isArray(raw.items) || raw.items.length > INTERIOR_ITEM_MAX_COUNT) {
    return { ok: false, message: `items는 ${INTERIOR_ITEM_MAX_COUNT}개 이하의 배열이어야 합니다` };
  }
  const items: InteriorItem[] = [];
  for (const [index, rawItem] of (raw.items as unknown[]).entries()) {
    const item = parseInteriorItem(rawItem);
    if (item === null)
      return { ok: false, message: `${index + 1}번째 항목의 값이 올바르지 않습니다` };
    items.push(item);
  }
  if (new Set(items.map(({ id }) => id)).size !== items.length) {
    return { ok: false, message: "항목 id가 겹칩니다" };
  }
  return { ok: true, value: { plan, items } };
}
