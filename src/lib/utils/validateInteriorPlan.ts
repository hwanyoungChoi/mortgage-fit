// 인테리어 플랜·항목 검증 규칙의 원본(ADR-029 조건 2). 로컬 저장소 읽기·서버 경계·로그인 이전이 함께 쓴다.
// worker 프로젝트(tsconfig.worker.json: lib ES2023, paths 없음)에서도 타입 검사를 통과하도록
// 이 파일과 전이 의존은 DOM 타입과 `@/` 별칭을 쓰지 않는다. 서버 봉투(`{ plan }`·`{ item }`)·PATCH 본문·
// import 항목 id 유일성 같은 요청 파싱은 `server/interiorPlans/`에 둔다.
//
// 규칙: 문자열은 앞뒤 공백을 뗀 값으로 길이(코드포인트)를 재고 그 값을 돌려준다. 선택 필드는 키 없음 = 없음이고
// 빈 문자열·빈 배열은 받되 돌려주는 객체에 키를 쓰지 않는다(ADR-012). 돌려주는 객체에는 알려진 키만 있다.

import { MAX_AMOUNT } from "./amount";
import { isOneOf } from "./isOneOf";
import { isListingId } from "./validateListingFields";
import { countChars } from "./validateListingName";
import {
  INTERIOR_CONTACT_MAX_LENGTH,
  INTERIOR_ITEM_MEMO_MAX_LENGTH,
  INTERIOR_ITEM_STATUSES,
  INTERIOR_LINE_ORDER_MAX_COUNT,
  INTERIOR_PAYMENT_LABEL_MAX_LENGTH,
  INTERIOR_PAYMENT_MAX_COUNT,
  INTERIOR_PLAN_NAME_MAX_LENGTH,
  INTERIOR_QUOTE_MAX_COUNT,
  INTERIOR_QUOTE_MEMO_MAX_LENGTH,
  INTERIOR_SPACE_MAX_COUNT,
  INTERIOR_SPACE_NAME_MAX_LENGTH,
  INTERIOR_TRADE_MAX_LENGTH,
  INTERIOR_VENDOR_MAX_LENGTH,
  MAX_WON,
} from "../constants/interiorPlan";

import type {
  InteriorItem,
  InteriorItemInput,
  InteriorItemStatus,
  InteriorPayment,
  InteriorPlan,
  InteriorPlanInput,
  InteriorQuote,
  InteriorSpace,
} from "../types/interiorPlan";

/** id 한 개의 모양. 줄 key 패턴도 여기서 만든다(id 규칙이 바뀌면 저장된 `lineOrder`도 같이 바뀌어야 하므로 한 곳) */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ID_SOURCE = ID_PATTERN.source.slice(1, -1);
/** 줄 key: `item.id:quote.id`, 견적 없는 줄은 `item.id:`(ADR-032·036) */
const LINE_KEY_PATTERN = new RegExp(`^${ID_SOURCE}:(?:${ID_SOURCE})?$`);
/** 플랜 id로 쓸 수 없는 값. `/api/interior-plans/import` 경로와 겹친다 */
const RESERVED_PLAN_ID = "import";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** `Date.prototype.toISOString`이 내는 모양(연도 4자리) */
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 키가 없거나 값이 undefined면 없는 것으로 본다(JSON에는 undefined가 없다). null은 값이 있는 것이다 */
function hasValue(record: UnknownRecord, key: string): boolean {
  return Object.hasOwn(record, key) && record[key] !== undefined;
}

/** 공간·항목·견적·지급 id. 매물 id와 같은 모양이다(로컬 id는 16바이트 hex, ADR-010) */
export function isInteriorId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/** 플랜 id: `isInteriorId`이고 "import"가 아니다(경로 id 검사에도 쓴다) */
export function isInteriorPlanId(value: unknown): value is string {
  return isInteriorId(value) && value !== RESERVED_PLAN_ID;
}

/** 예산·지급 금액: 만원 정수 1~999,999,999. 소수·문자열·NaN은 아니다 */
export function isInteriorAmount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= MAX_AMOUNT;
}

/** 견적 금액: 만원 정수 0~999,999,999. 0은 셀프 시공처럼 금액이 정해진 0이다(미정 아님, ADR-033 개정) */
function isInteriorQuoteAmount(value: unknown): value is number {
  return value === 0 || isInteriorAmount(value);
}

/** 총 예산(원): 원 정수 1~9,999,999,999,999(ADR-034). 소수·문자열·NaN은 아니다 */
export function isInteriorWon(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= MAX_WON;
}

/** 견적 금액(원): 원 정수 0~9,999,999,999,999. 0은 금액이 정해진 0이다(ADR-034 조건 3) */
function isInteriorQuoteWon(value: unknown): value is number {
  return value === 0 || isInteriorWon(value);
}

export function isInteriorItemStatus(value: unknown): value is InteriorItemStatus {
  return isOneOf(INTERIOR_ITEM_STATUSES, value);
}

/** YYYY-MM-DD이고 실제 달력에 있는 날(2026-13-01·2026-02-30은 아니다) */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** `toISOString` 고정 형식(YYYY-MM-DDTHH:mm:ss.sssZ)만. `+09:00`·밀리초 없음은 아니다(정렬이 문자열 비교) */
export function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) return false;
  const time = Date.parse(value);
  return !Number.isNaN(time) && new Date(time).toISOString() === value;
}

/** 필수 문자열: trim 후 1~maxLength자면 trim한 값, 아니면 null */
function parseRequiredText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const length = countChars(text);
  return length >= 1 && length <= maxLength ? text : null;
}

/** 선택 문자열: 키 없음·trim 후 빈 값은 undefined, trim 후 maxLength자 이하면 그 값, 그 밖은 null */
function parseOptionalText(
  record: UnknownRecord,
  key: string,
  maxLength: number,
): string | undefined | null {
  if (!hasValue(record, key)) return undefined;
  const value = record[key];
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text === "") return undefined;
  return countChars(text) <= maxLength ? text : null;
}

/** 선택 값: 키 없음은 undefined, 규칙에 맞으면 그 값, 그 밖(null 포함)은 null */
function parseOptional<T>(
  record: UnknownRecord,
  key: string,
  isValid: (value: unknown) => value is T,
): T | undefined | null {
  if (!hasValue(record, key)) return undefined;
  const value = record[key];
  return isValid(value) ? value : null;
}

function hasUniqueIds(entries: { id: string }[]): boolean {
  return new Set(entries.map((entry) => entry.id)).size === entries.length;
}

/** 플랜 이름: trim 후 1~40자면 trim한 이름, 아니면 null */
export function parseInteriorPlanName(value: unknown): string | null {
  return parseRequiredText(value, INTERIOR_PLAN_NAME_MAX_LENGTH);
}

/** 공간 목록: 1~30개, 이름 trim 후 1~20자, id 유일. 알려진 키만 담은 새 배열, 어긋나면 null */
export function parseInteriorSpaces(value: unknown): InteriorSpace[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > INTERIOR_SPACE_MAX_COUNT) {
    return null;
  }
  const spaces: InteriorSpace[] = [];
  for (const space of value as unknown[]) {
    if (!isRecord(space) || !isInteriorId(space.id)) return null;
    const name = parseRequiredText(space.name, INTERIOR_SPACE_NAME_MAX_LENGTH);
    if (name === null) return null;
    spaces.push({ id: space.id, name });
  }
  return hasUniqueIds(spaces) ? spaces : null;
}

/**
 * 견적 금액은 선택이다. `amount`(만원)·`amountWon`(원) 둘 다 키 없음 = 금액 미정, 0은 금액이 0인 견적(ADR-033).
 * 두 키가 함께 있으면 어느 쪽도 고르지 않고 거부한다(같은 환산값이어도, ADR-034). 받은 키를 그대로 돌려준다.
 * 업체도 선택이다: 키 없음(undefined 포함) = 업체 미정(ADR-036). 값이 있으면 `""`·공백·null도 필수 문자열 규칙으로 거부한다
 * (미정의 표현은 키 없음 하나다. 선택 문자열처럼 `""`를 받아 키를 빼지 않는다)
 */
function parseQuote(value: unknown): InteriorQuote | null {
  if (!isRecord(value) || !isInteriorId(value.id)) return null;
  const vendor = hasValue(value, "vendor")
    ? parseRequiredText(value.vendor, INTERIOR_VENDOR_MAX_LENGTH)
    : undefined;
  const contact = parseOptionalText(value, "contact", INTERIOR_CONTACT_MAX_LENGTH);
  const amount = parseOptional(value, "amount", isInteriorQuoteAmount);
  const amountWon = parseOptional(value, "amountWon", isInteriorQuoteWon);
  const memo = parseOptionalText(value, "memo", INTERIOR_QUOTE_MEMO_MAX_LENGTH);
  if (
    vendor === null ||
    contact === null ||
    amount === null ||
    amountWon === null ||
    memo === null ||
    (amount !== undefined && amountWon !== undefined)
  ) {
    return null;
  }
  return {
    id: value.id,
    ...(vendor !== undefined && { vendor }),
    ...(contact !== undefined && { contact }),
    ...(amount !== undefined && { amount }),
    ...(amountWon !== undefined && { amountWon }),
    ...(memo !== undefined && { memo }),
  };
}

function parsePayment(value: unknown): InteriorPayment | null {
  if (!isRecord(value) || !isInteriorId(value.id) || !isInteriorAmount(value.amount)) return null;
  const label = parseRequiredText(value.label, INTERIOR_PAYMENT_LABEL_MAX_LENGTH);
  const dueDate = parseOptional(value, "dueDate", isCalendarDate);
  if (label === null || dueDate === null || typeof value.isPaid !== "boolean") return null;
  return {
    id: value.id,
    label,
    amount: value.amount,
    ...(dueDate !== undefined && { dueDate }),
    isPaid: value.isPaid,
  };
}

/**
 * 줄 순서(ADR-036 조건 2): 비어 있지 않고, 원소가 모두 줄 key이고, 중복이 없고, `INTERIOR_LINE_ORDER_MAX_COUNT`개 이하인
 * 배열만 새 배열로 돌려준다(받은 순서 그대로). 그 밖(빈 배열 포함)은 null. 빈 배열의 뜻은 부르는 쪽이 정한다
 * (플랜 필드: 키 없음, 서버 PATCH: null과 같은 키 삭제). 항목에 실제로 있는 key인지는 보지 않는다
 */
export function parseLineOrder(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > INTERIOR_LINE_ORDER_MAX_COUNT) {
    return null;
  }
  const keys: string[] = [];
  for (const key of value as unknown[]) {
    if (typeof key !== "string" || !LINE_KEY_PATTERN.test(key)) return null;
    keys.push(key);
  }
  return new Set(keys).size === keys.length ? keys : null;
}

/** 선택 배열: 키 없음·빈 배열은 undefined, 0~maxCount개이고 각 줄이 맞고 id가 유일하면 새 배열, 그 밖은 null */
function parseOptionalList<T extends { id: string }>(
  record: UnknownRecord,
  key: string,
  maxCount: number,
  parseEntry: (value: unknown) => T | null,
): T[] | undefined | null {
  if (!hasValue(record, key)) return undefined;
  const value = record[key];
  if (!Array.isArray(value) || value.length > maxCount) return null;
  const entries: T[] = [];
  for (const raw of value as unknown[]) {
    const entry = parseEntry(raw);
    if (entry === null) return null;
    entries.push(entry);
  }
  if (!hasUniqueIds(entries)) return null;
  return entries.length > 0 ? entries : undefined;
}

/**
 * 플랜 필드(id·시각 제외)를 검증하고 알려진 키만 담은 새 객체를 돌려준다. 어긋나면 null.
 * 총 예산 `budget`(만원)·`budgetWon`(원)이 함께 있으면 거부한다(ADR-034). `lineOrder`의 빈 배열은 키 없음이다(ADR-036 조건 2)
 */
export function validateInteriorPlanFields(value: unknown): InteriorPlanInput | null {
  if (!isRecord(value)) return null;
  const name = parseInteriorPlanName(value.name);
  const budget = parseOptional(value, "budget", isInteriorAmount);
  const budgetWon = parseOptional(value, "budgetWon", isInteriorWon);
  const listingId = parseOptional(value, "listingId", isListingId);
  const spaces = parseInteriorSpaces(value.spaces);
  const isLineOrderEmpty = Array.isArray(value.lineOrder) && value.lineOrder.length === 0;
  const lineOrder =
    !hasValue(value, "lineOrder") || isLineOrderEmpty ? undefined : parseLineOrder(value.lineOrder);
  if (
    name === null ||
    budget === null ||
    budgetWon === null ||
    listingId === null ||
    spaces === null ||
    lineOrder === null ||
    (budget !== undefined && budgetWon !== undefined)
  ) {
    return null;
  }
  return {
    name,
    ...(budget !== undefined && { budget }),
    ...(budgetWon !== undefined && { budgetWon }),
    ...(listingId !== undefined && { listingId }),
    spaces,
    ...(lineOrder !== undefined && { lineOrder }),
  };
}

/**
 * 항목 필드(id·시각 제외)를 검증하고 알려진 키만 담은 새 객체를 돌려준다. 어긋나면 null.
 * `confirmedQuoteId`는 `quotes` 안의 id여야 하고, 시작·끝 날짜가 둘 다 있으면 끝 ≥ 시작이다.
 * `spaceId`는 형식만 본다(플랜 공간에 있는지는 보지 않는다).
 */
export function validateInteriorItemFields(value: unknown): InteriorItemInput | null {
  if (!isRecord(value) || !isInteriorId(value.spaceId) || !isInteriorItemStatus(value.status)) {
    return null;
  }
  const trade = parseRequiredText(value.trade, INTERIOR_TRADE_MAX_LENGTH);
  const budget = parseOptional(value, "budget", isInteriorAmount);
  const quotes = parseOptionalList(value, "quotes", INTERIOR_QUOTE_MAX_COUNT, parseQuote);
  const confirmedQuoteId = parseOptional(value, "confirmedQuoteId", isInteriorId);
  const payments = parseOptionalList(value, "payments", INTERIOR_PAYMENT_MAX_COUNT, parsePayment);
  const startDate = parseOptional(value, "startDate", isCalendarDate);
  const endDate = parseOptional(value, "endDate", isCalendarDate);
  const memo = parseOptionalText(value, "memo", INTERIOR_ITEM_MEMO_MAX_LENGTH);
  if (
    trade === null ||
    budget === null ||
    quotes === null ||
    confirmedQuoteId === null ||
    payments === null ||
    startDate === null ||
    endDate === null ||
    memo === null
  ) {
    return null;
  }
  const isConfirmedQuoteKnown =
    confirmedQuoteId === undefined || (quotes ?? []).some((quote) => quote.id === confirmedQuoteId);
  // YYYY-MM-DD는 문자열 비교가 날짜 비교다
  const isDateRangeValid = startDate === undefined || endDate === undefined || endDate >= startDate;
  if (!isConfirmedQuoteKnown || !isDateRangeValid) return null;
  return {
    spaceId: value.spaceId,
    trade,
    ...(budget !== undefined && { budget }),
    ...(quotes !== undefined && { quotes }),
    ...(confirmedQuoteId !== undefined && { confirmedQuoteId }),
    ...(payments !== undefined && { payments }),
    status: value.status,
    ...(startDate !== undefined && { startDate }),
    ...(endDate !== undefined && { endDate }),
    ...(memo !== undefined && { memo }),
  };
}

/** 저장된 플랜 하나(id·시각 포함)를 검증하고 알려진 키만 담은 새 객체를 돌려준다. 어긋나면 null */
export function parseInteriorPlan(value: unknown): InteriorPlan | null {
  if (
    !isRecord(value) ||
    !isInteriorPlanId(value.id) ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt)
  ) {
    return null;
  }
  const fields = validateInteriorPlanFields(value);
  if (fields === null) return null;
  return { id: value.id, ...fields, createdAt: value.createdAt, updatedAt: value.updatedAt };
}

/** 저장된 항목 하나(id·시각 포함)를 검증하고 알려진 키만 담은 새 객체를 돌려준다. 어긋나면 null */
export function parseInteriorItem(value: unknown): InteriorItem | null {
  if (
    !isRecord(value) ||
    !isInteriorId(value.id) ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt)
  ) {
    return null;
  }
  const fields = validateInteriorItemFields(value);
  if (fields === null) return null;
  return { id: value.id, ...fields, createdAt: value.createdAt, updatedAt: value.updatedAt };
}

export function isInteriorPlan(value: unknown): value is InteriorPlan {
  return parseInteriorPlan(value) !== null;
}

export function isInteriorItem(value: unknown): value is InteriorItem {
  return parseInteriorItem(value) !== null;
}
