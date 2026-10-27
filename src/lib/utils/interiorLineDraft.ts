import {
  INTERIOR_ITEM_MEMO_MAX_LENGTH,
  INTERIOR_QUOTE_MEMO_MAX_LENGTH,
  INTERIOR_TRADE_MAX_LENGTH,
  INTERIOR_VENDOR_MAX_LENGTH,
} from "@/lib/constants/interiorPlan";

import { validateAmount } from "./amount";
import { optionalTextError, requiredTextError } from "./interiorTextErrors";

import type { InteriorPlanRow } from "./interiorPlanRows";
import type {
  InteriorLineDraft,
  InteriorLineDraftError,
  InteriorLineDraftField,
  InteriorLineValues,
} from "@/lib/types/interiorLineDraft";

const TRADE_REQUIRED_MESSAGE = "구분을 입력하세요";
const VENDOR_REQUIRED_MESSAGE = "업체 이름을 입력하세요";
const AMOUNT_REQUIRED_MESSAGE = "견적 금액을 입력하세요";

/** 새 줄. 묶음 끝 [+ {구분}에 줄 추가]면 그 구분을 채운다. 확정은 꺼진 채 시작한다(U3) */
export function createInteriorLineDraft(trade = ""): InteriorLineDraft {
  return { trade, vendor: "", amount: "", detail: "", note: "", isConfirmed: false };
}

/**
 * 저장된 줄 → 시트 입력. 시트를 연 시점의 값으로만 쓴다(재조회로 바뀌어도 입력을 덮지 않는다).
 * 비고는 `item.memo`뿐이다. 빈 줄의 "예산 n만원"은 표시용이라 넣지 않는다(합성 비고 미저장).
 */
export function toInteriorLineDraft({
  item,
  quote,
  isConfirmed,
}: InteriorPlanRow): InteriorLineDraft {
  return {
    trade: item.trade,
    vendor: quote?.vendor ?? "",
    // 견적 없는 줄과 금액 미정(키 없음, ADR-033)은 빈칸이다(`String(undefined)`가 "undefined"를 넣지 않게)
    amount: quote?.amount === undefined ? "" : String(quote.amount),
    detail: quote?.memo ?? "",
    note: item.memo ?? "",
    isConfirmed,
  };
}

/** 고친 것이 있는지(저장 버튼·닫기 확인) */
export function isSameLineDraft(a: InteriorLineDraft, b: InteriorLineDraft): boolean {
  return (Object.keys(a) as (keyof InteriorLineDraft)[]).every((key) => a[key] === b[key]);
}

function amountError(raw: string): string | null {
  const validation = validateAmount(raw);
  if (validation.status === "empty") return AMOUNT_REQUIRED_MESSAGE;
  return validation.status === "error" ? validation.message : null;
}

/**
 * 시트 입력의 오류(화면 순서). 길이는 앞뒤 공백을 뗀 코드포인트 수이고 저장 규칙은 공용 검증(`validateInteriorItemFields`)과 같다.
 * 구분·업체·견적은 필수, 세부내용·비고는 선택이다(U3).
 */
export function interiorLineDraftErrors(draft: InteriorLineDraft): InteriorLineDraftError[] {
  const candidates: [InteriorLineDraftField, string | null][] = [
    ["trade", requiredTextError(draft.trade, INTERIOR_TRADE_MAX_LENGTH, TRADE_REQUIRED_MESSAGE)],
    ["detail", optionalTextError(draft.detail, INTERIOR_QUOTE_MEMO_MAX_LENGTH)],
    [
      "vendor",
      requiredTextError(draft.vendor, INTERIOR_VENDOR_MAX_LENGTH, VENDOR_REQUIRED_MESSAGE),
    ],
    ["amount", amountError(draft.amount)],
    ["note", optionalTextError(draft.note, INTERIOR_ITEM_MEMO_MAX_LENGTH)],
  ];
  return candidates.flatMap(([field, message]) => (message === null ? [] : [{ field, message }]));
}

/** 빈 칸(공백만 포함)은 undefined — 저장할 때 키를 쓰지 않는다(ADR-012) */
function optionalText(raw: string): string | undefined {
  const text = raw.trim();
  return text === "" ? undefined : text;
}

/** 시트 입력 → 줄 값. 오류가 있으면 화면 순서의 오류 목록 */
export function validateInteriorLineDraft(
  draft: InteriorLineDraft,
): { ok: true; values: InteriorLineValues } | { ok: false; errors: InteriorLineDraftError[] } {
  const errors = interiorLineDraftErrors(draft);
  const amount = validateAmount(draft.amount);
  if (errors.length > 0 || amount.status !== "valid") return { ok: false, errors };
  const detail = optionalText(draft.detail);
  const note = optionalText(draft.note);
  return {
    ok: true,
    values: {
      trade: draft.trade.trim(),
      vendor: draft.vendor.trim(),
      amount: amount.value,
      ...(detail !== undefined && { detail }),
      ...(note !== undefined && { note }),
      isConfirmed: draft.isConfirmed,
    },
  };
}
