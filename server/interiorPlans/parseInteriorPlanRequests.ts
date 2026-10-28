// /api/interior-plans 본문 검증. 플랜·항목 규칙은 로컬 저장소와 같은 공용 검증(`validateInteriorPlan.ts`)을 쓰고,
// 여기에는 서버 경계만 둔다: 봉투(`{ plan }`·`{ item }`), PATCH 부분 검증, 개수 상한, import 항목 id 유일성.
// 공용 함수가 알려진 키만 담은 새 객체를 돌려주므로 저장 값에 모르는 키가 들어가지 않는다(ADR-029 조건 2).
import {
  INTERIOR_ITEM_MAX_COUNT,
  INTERIOR_LINE_ORDER_MAX_COUNT,
  INTERIOR_PLAN_CREATE_MAX_ITEMS,
} from "../../src/lib/constants/interiorPlan";
import { budgetMergePatch } from "../../src/lib/utils/budgetMergePatch";
import {
  isInteriorAmount,
  isInteriorWon,
  parseInteriorItem,
  parseInteriorPlan,
  parseInteriorPlanName,
  parseInteriorSpaces,
  parseLineOrder,
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

const INVALID_PLAN_MESSAGE = "요청 본문은 { plan } 객체이고 플랜 값이 올바라야 합니다";

/**
 * POST /api/interior-plans 본문 `{ plan: { name, budget?, listingId?, spaces, items? } }`. items는 0~30개.
 * `lineOrder`는 모르는 키처럼 값과 상관없이 버린다(ADR-036 조건 3): 이 경로는 항목 id를 서버가 만들어
 * 클라이언트가 보낸 줄 key(`item.id:quote.id`)가 맞을 수 없다. id를 보존하는 `/import`는 `lineOrder`도 보존한다
 */
export function parsePlanCreateRequest(value: unknown): Parsed<PlanCreate> {
  const raw = isRecord(value) ? value.plan : undefined;
  if (!isRecord(raw)) return { ok: false, message: INVALID_PLAN_MESSAGE };
  const plan = validateInteriorPlanFields({ ...raw, lineOrder: undefined });
  if (plan === null) return { ok: false, message: INVALID_PLAN_MESSAGE };
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
 * PATCH 본문 `{ plan: { name?, budget?, budgetWon?, listingId?, spaces?, lineOrder? } }`를 `interior_plans.data`에 합칠
 * JSON Merge Patch(RFC 7396)로. 키 없음 = 그대로, `budget`·`budgetWon`·`listingId`·`lineOrder`의 null = 지움.
 * 이름·공간은 지울 수 없다. `lineOrder: []`는 null과 같은 키 삭제다(400 아님, ADR-036 조건 2).
 * 알려진 키가 하나 이상 있어야 한다. 총 예산 두 키는 `budgetMergePatch`로 함께 정한다(하나를 쓰면 다른 키는 지움).
 */
export function parsePlanPatchRequest(value: unknown): Parsed<InteriorPlanPatch> {
  const raw = isRecord(value) ? value.plan : undefined;
  const has = (key: string) => isRecord(raw) && Object.hasOwn(raw, key);
  if (
    !isRecord(raw) ||
    !["name", "budget", "budgetWon", "listingId", "spaces", "lineOrder"].some(has)
  ) {
    return {
      ok: false,
      message:
        "요청 본문은 { plan } 객체이고 name, budget, budgetWon, listingId, spaces, lineOrder 중 하나 이상이 있어야 합니다",
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
  if (has("budgetWon")) {
    if (raw.budgetWon !== null && !isInteriorWon(raw.budgetWon)) {
      return {
        ok: false,
        message: "budgetWon은 1~9,999,999,999,999 정수(원) 또는 null이어야 합니다",
      };
    }
    patch.budgetWon = raw.budgetWon;
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
  if (has("lineOrder")) {
    const isDelete =
      raw.lineOrder === null || (Array.isArray(raw.lineOrder) && raw.lineOrder.length === 0);
    const lineOrder = isDelete ? null : parseLineOrder(raw.lineOrder);
    if (!isDelete && lineOrder === null) {
      return {
        ok: false,
        message: `lineOrder는 줄 key 배열(최대 ${INTERIOR_LINE_ORDER_MAX_COUNT}개)이거나 null이어야 합니다`,
      };
    }
    patch.lineOrder = lineOrder;
  }
  const budgets = budgetMergePatch(patch);
  if (budgets === null) {
    return { ok: false, message: "budget과 budgetWon을 함께 숫자로 보낼 수 없습니다" };
  }
  return { ok: true, value: { ...patch, ...budgets } };
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
