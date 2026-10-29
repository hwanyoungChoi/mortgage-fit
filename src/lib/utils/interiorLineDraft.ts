import {
  INTERIOR_ITEM_MEMO_MAX_LENGTH,
  INTERIOR_QUOTE_MEMO_MAX_LENGTH,
  INTERIOR_TRADE_MAX_LENGTH,
  INTERIOR_VENDOR_MAX_LENGTH,
  QUOTE_MIN_WON,
} from "@/lib/constants/interiorPlan";

import { validateWonAmount } from "./amount";
import { vendorOf } from "./interiorPlanRows";
import { optionalTextError, requiredTextError } from "./interiorTextErrors";
import { isCalendarDate } from "./validateInteriorPlan";

import type { InteriorPlanRow } from "./interiorPlanRows";
import type {
  InteriorLineDraft,
  InteriorLineDraftError,
  InteriorLineDraftField,
  InteriorLineValues,
} from "@/lib/types/interiorLineDraft";

const TRADE_REQUIRED_MESSAGE = "구분을 입력하세요";
const DATE_INVALID_MESSAGE = "날짜를 확인하세요";
const END_BEFORE_START_MESSAGE = "끝나는 날은 시작일과 같거나 뒤여야 합니다";

/** 새 줄. 묶음 끝 [+ {구분}에 줄 추가]면 그 구분을 채운다. 확정은 꺼진 채 시작한다(U3) */
export function createInteriorLineDraft(trade = ""): InteriorLineDraft {
  return {
    trade,
    vendor: "",
    amount: "",
    detail: "",
    startDate: "",
    endDate: "",
    note: "",
    isConfirmed: false,
  };
}

/**
 * 저장된 줄 → 시트 입력. 시트를 연 시점의 값으로만 쓴다(재조회로 바뀌어도 입력을 덮지 않는다).
 * 비고는 `item.memo`뿐이다. 빈 줄의 "예산 n원"은 표시용이라 넣지 않는다(합성 비고 미저장).
 */
export function toInteriorLineDraft({
  item,
  quote,
  quoteWon,
  isConfirmed,
}: InteriorPlanRow): InteriorLineDraft {
  return {
    trade: item.trade,
    // 업체 미정(키 없음)은 빈칸이다
    vendor: quote === null ? "" : (vendorOf(quote) ?? ""),
    // 원 글자로 채운다(옛 만원 `amount`도 `quoteWonOf`가 원으로 읽은 값). 0원은 "0"이다.
    // 견적 없는 줄과 금액 미정(키 없음, ADR-033)은 빈칸이다(`String(undefined)`가 "undefined"를 넣지 않게)
    amount: quoteWon === undefined ? "" : String(quoteWon),
    detail: quote?.memo ?? "",
    startDate: item.startDate ?? "",
    endDate: item.endDate ?? "",
    note: item.memo ?? "",
    isConfirmed,
  };
}

/** 고친 것이 있는지(저장 버튼·닫기 확인) */
export function isSameLineDraft(a: InteriorLineDraft, b: InteriorLineDraft): boolean {
  return (Object.keys(a) as (keyof InteriorLineDraft)[]).every((key) => a[key] === b[key]);
}

/** 빈칸(공백만 포함)은 오류가 아니라 금액 미정이다(U1) */
function amountError(raw: string): string | null {
  const validation = validateWonAmount(raw, QUOTE_MIN_WON);
  return validation.status === "error" ? validation.message : null;
}

/** 날짜 칸은 빈칸(없음)이거나 달력에 있는 YYYY-MM-DD다. 날짜 칸(`type="date"`)이 다른 값을 주지 않지만 저장 규칙과 맞춘다 */
function dateError(raw: string): string | null {
  return raw === "" || isCalendarDate(raw) ? null : DATE_INVALID_MESSAGE;
}

/** 둘 다 있으면 끝나는 날이 시작일과 같거나 뒤다(공용 검증과 같은 규칙). 끝나는 날만 있어도 된다 */
function endDateError(startDate: string, endDate: string): string | null {
  const error = dateError(endDate);
  if (error !== null || startDate === "" || endDate === "" || dateError(startDate) !== null) {
    return error;
  }
  return endDate < startDate ? END_BEFORE_START_MESSAGE : null;
}

/**
 * 시트 입력의 오류(화면 순서). 길이는 앞뒤 공백을 뗀 코드포인트 수이고 저장 규칙은 공용 검증(`validateInteriorItemFields`)과 같다.
 * 구분은 필수, 업체(비우면 미정)·견적(비우면 미정)·세부내용·일정·비고는 선택이다(U1·U3, ADR-036).
 */
export function interiorLineDraftErrors(draft: InteriorLineDraft): InteriorLineDraftError[] {
  const candidates: [InteriorLineDraftField, string | null][] = [
    ["trade", requiredTextError(draft.trade, INTERIOR_TRADE_MAX_LENGTH, TRADE_REQUIRED_MESSAGE)],
    ["detail", optionalTextError(draft.detail, INTERIOR_QUOTE_MEMO_MAX_LENGTH)],
    ["vendor", optionalTextError(draft.vendor, INTERIOR_VENDOR_MAX_LENGTH)],
    ["amount", amountError(draft.amount)],
    ["startDate", dateError(draft.startDate)],
    ["endDate", endDateError(draft.startDate, draft.endDate)],
    ["note", optionalTextError(draft.note, INTERIOR_ITEM_MEMO_MAX_LENGTH)],
  ];
  return candidates.flatMap(([field, message]) => (message === null ? [] : [{ field, message }]));
}

/** 빈 칸(공백만 포함)은 undefined — 저장할 때 키를 쓰지 않는다(ADR-012·036). 견적 칸은 `validateWonAmount`의 empty가 같은 뜻이다 */
function optionalText(raw: string): string | undefined {
  const text = raw.trim();
  return text === "" ? undefined : text;
}

/** 시트 입력 → 줄 값. 오류가 있으면 화면 순서의 오류 목록 */
export function validateInteriorLineDraft(
  draft: InteriorLineDraft,
): { ok: true; values: InteriorLineValues } | { ok: false; errors: InteriorLineDraftError[] } {
  const errors = interiorLineDraftErrors(draft);
  const amount = validateWonAmount(draft.amount, QUOTE_MIN_WON);
  if (errors.length > 0 || amount.status === "error") return { ok: false, errors };
  const vendor = optionalText(draft.vendor);
  const detail = optionalText(draft.detail);
  const note = optionalText(draft.note);
  return {
    ok: true,
    values: {
      trade: draft.trade.trim(),
      ...(vendor !== undefined && { vendor }),
      ...(amount.status === "valid" && { amountWon: amount.value }),
      ...(detail !== undefined && { detail }),
      ...(draft.startDate !== "" && { startDate: draft.startDate }),
      ...(draft.endDate !== "" && { endDate: draft.endDate }),
      ...(note !== undefined && { note }),
      isConfirmed: draft.isConfirmed,
    },
  };
}
