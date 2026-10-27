import {
  INTERIOR_CONTACT_MAX_LENGTH,
  INTERIOR_ITEM_MEMO_MAX_LENGTH,
  INTERIOR_PAYMENT_LABEL_MAX_LENGTH,
  INTERIOR_QUOTE_MEMO_MAX_LENGTH,
  INTERIOR_TRADE_MAX_LENGTH,
  INTERIOR_VENDOR_MAX_LENGTH,
} from "@/lib/constants/interiorPlan";

import { validateAmount } from "./amount";
import { optionalTextError, requiredTextError } from "./interiorTextErrors";
import { isCalendarDate } from "./validateInteriorPlan";

import type {
  InteriorItemDraft,
  InteriorItemDraftError,
  InteriorItemDraftField,
  InteriorPaymentDraft,
  InteriorQuoteDraft,
} from "@/lib/types/interiorItemDraft";
import type {
  InteriorItem,
  InteriorItemInput,
  InteriorItemStatus,
  InteriorPayment,
  InteriorQuote,
} from "@/lib/types/interiorPlan";

export const quoteField = (quoteId: string, name: "vendor" | "contact" | "amount" | "memo") =>
  `quote:${quoteId}:${name}` as const;
export const paymentField = (paymentId: string, name: "label" | "amount" | "dueDate") =>
  `payment:${paymentId}:${name}` as const;

const END_BEFORE_START_MESSAGE = "끝 날짜가 시작 날짜보다 앞입니다";
const DATE_FORMAT_MESSAGE = "날짜를 YYYY-MM-DD 형식으로 입력하세요";
const AMOUNT_REQUIRED_MESSAGE = "금액을 입력하세요";
const SPACE_REQUIRED_MESSAGE = "공간을 고르세요";

/** 새 항목: 계획 상태, 견적·지급 줄 없음 */
export function createInteriorItemDraft(spaceId: string): InteriorItemDraft {
  return {
    spaceId,
    trade: "",
    budget: "",
    quotes: [],
    confirmedQuoteId: null,
    payments: [],
    status: "planned",
    startDate: "",
    endDate: "",
    memo: "",
  };
}

export function createQuoteDraft(id: string): InteriorQuoteDraft {
  return { id, vendor: "", contact: "", amount: "", memo: "" };
}

export function createPaymentDraft(id: string, label: string): InteriorPaymentDraft {
  return { id, label, amount: "", dueDate: "", isPaid: false };
}

/** 저장된 항목 → 시트 입력. 시트를 연 시점의 값으로만 쓴다(재조회로 바뀌어도 입력을 덮지 않는다) */
export function toInteriorItemDraft(item: InteriorItem): InteriorItemDraft {
  return {
    spaceId: item.spaceId,
    trade: item.trade,
    budget: item.budget === undefined ? "" : String(item.budget),
    quotes: (item.quotes ?? []).map((quote) => ({
      id: quote.id,
      vendor: quote.vendor,
      contact: quote.contact ?? "",
      amount: String(quote.amount),
      memo: quote.memo ?? "",
    })),
    confirmedQuoteId: item.confirmedQuoteId ?? null,
    payments: (item.payments ?? []).map((payment) => ({
      id: payment.id,
      label: payment.label,
      amount: String(payment.amount),
      dueDate: payment.dueDate ?? "",
      isPaid: payment.isPaid,
    })),
    status: item.status,
    startDate: item.startDate ?? "",
    endDate: item.endDate ?? "",
    memo: item.memo ?? "",
  };
}

/** 고친 것이 있는지(저장 버튼·닫기 확인) */
export function isSameItemDraft(a: InteriorItemDraft, b: InteriorItemDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 견적을 확정하면 계획·견적 중일 때만 "확정"으로 올린다. 그 밖의 상태는 사용자가 정한 그대로다(A3) */
export function statusAfterConfirm(status: InteriorItemStatus): InteriorItemStatus {
  return status === "planned" || status === "quoting" ? "confirmed" : status;
}

export function confirmQuote(draft: InteriorItemDraft, quoteId: string): InteriorItemDraft {
  return { ...draft, confirmedQuoteId: quoteId, status: statusAfterConfirm(draft.status) };
}

/** 확정만 푼다. 상태는 되돌리지 않는다(사용자가 고른다) */
export function cancelQuoteConfirm(draft: InteriorItemDraft): InteriorItemDraft {
  return { ...draft, confirmedQuoteId: null };
}

/** 견적 줄을 지운다. 확정한 견적이었으면 확정도 풀린다(AC-4) */
export function removeQuote(draft: InteriorItemDraft, quoteId: string): InteriorItemDraft {
  return {
    ...draft,
    quotes: draft.quotes.filter((quote) => quote.id !== quoteId),
    confirmedQuoteId: draft.confirmedQuoteId === quoteId ? null : draft.confirmedQuoteId,
  };
}

/** 선택 금액: 비면 통과, 아니면 기존 금액 규칙(0·소수·10억 이상 거부, 반올림 안 함) */
function optionalAmountError(raw: string): string | null {
  const validation = validateAmount(raw);
  return validation.status === "error" ? validation.message : null;
}

function requiredAmountError(raw: string): string | null {
  return validateAmount(raw).status === "empty"
    ? AMOUNT_REQUIRED_MESSAGE
    : optionalAmountError(raw);
}

function dateError(raw: string): string | null {
  return raw === "" || isCalendarDate(raw) ? null : DATE_FORMAT_MESSAGE;
}

/**
 * 시트 입력의 오류(화면 순서). 저장 규칙은 공용 검증(`validateInteriorItemFields`)과 같고 여기서는 칸마다 이유를 말한다.
 * `spaceIds`는 플랜의 공간 id. 동시 편집으로 사라진 공간을 가리키면 다시 고르게 한다.
 */
export function interiorItemDraftErrors(
  draft: InteriorItemDraft,
  spaceIds: string[],
): InteriorItemDraftError[] {
  const errors: InteriorItemDraftError[] = [];
  const add = (field: InteriorItemDraftField, message: string | null) => {
    if (message !== null) errors.push({ field, message });
  };
  add("spaceId", spaceIds.includes(draft.spaceId) ? null : SPACE_REQUIRED_MESSAGE);
  add("trade", requiredTextError(draft.trade, INTERIOR_TRADE_MAX_LENGTH, "공종을 입력하세요"));
  add("budget", optionalAmountError(draft.budget));
  for (const quote of draft.quotes) {
    add(
      quoteField(quote.id, "vendor"),
      requiredTextError(quote.vendor, INTERIOR_VENDOR_MAX_LENGTH, "업체 이름을 입력하세요"),
    );
    add(
      quoteField(quote.id, "contact"),
      optionalTextError(quote.contact, INTERIOR_CONTACT_MAX_LENGTH),
    );
    add(quoteField(quote.id, "amount"), requiredAmountError(quote.amount));
    add(
      quoteField(quote.id, "memo"),
      optionalTextError(quote.memo, INTERIOR_QUOTE_MEMO_MAX_LENGTH),
    );
  }
  for (const payment of draft.payments) {
    add(
      paymentField(payment.id, "label"),
      requiredTextError(payment.label, INTERIOR_PAYMENT_LABEL_MAX_LENGTH, "이름을 입력하세요"),
    );
    add(paymentField(payment.id, "amount"), requiredAmountError(payment.amount));
    add(paymentField(payment.id, "dueDate"), dateError(payment.dueDate));
  }
  add("startDate", dateError(draft.startDate));
  const isRangeComparable = isCalendarDate(draft.startDate) && isCalendarDate(draft.endDate);
  add(
    "endDate",
    dateError(draft.endDate) ??
      (isRangeComparable && draft.endDate < draft.startDate ? END_BEFORE_START_MESSAGE : null),
  );
  add("memo", optionalTextError(draft.memo, INTERIOR_ITEM_MEMO_MAX_LENGTH));
  return errors;
}

/** 검증을 통과한 금액 문자열 → 숫자 */
function amountOf(raw: string): number | undefined {
  const validation = validateAmount(raw);
  return validation.status === "valid" ? validation.value : undefined;
}

/** 빈 문자열은 키를 쓰지 않는다(ADR-012) */
function textOf(raw: string): string | undefined {
  const text = raw.trim();
  return text === "" ? undefined : text;
}

function toQuote(quote: InteriorQuoteDraft): InteriorQuote {
  const contact = textOf(quote.contact);
  const memo = textOf(quote.memo);
  return {
    id: quote.id,
    vendor: quote.vendor.trim(),
    ...(contact !== undefined && { contact }),
    amount: amountOf(quote.amount) ?? 0,
    ...(memo !== undefined && { memo }),
  };
}

function toPayment(payment: InteriorPaymentDraft): InteriorPayment {
  return {
    id: payment.id,
    label: payment.label.trim(),
    amount: amountOf(payment.amount) ?? 0,
    ...(payment.dueDate !== "" && { dueDate: payment.dueDate }),
    isPaid: payment.isPaid,
  };
}

/** 시트 입력 → 저장할 항목. 오류가 있으면 화면 순서의 오류 목록 */
export function validateInteriorItemDraft(
  draft: InteriorItemDraft,
  spaceIds: string[],
): { ok: true; input: InteriorItemInput } | { ok: false; errors: InteriorItemDraftError[] } {
  const errors = interiorItemDraftErrors(draft, spaceIds);
  if (errors.length > 0) return { ok: false, errors };
  const budget = amountOf(draft.budget);
  const memo = textOf(draft.memo);
  return {
    ok: true,
    input: {
      spaceId: draft.spaceId,
      trade: draft.trade.trim(),
      ...(budget !== undefined && { budget }),
      ...(draft.quotes.length > 0 && { quotes: draft.quotes.map(toQuote) }),
      ...(draft.confirmedQuoteId !== null && { confirmedQuoteId: draft.confirmedQuoteId }),
      ...(draft.payments.length > 0 && { payments: draft.payments.map(toPayment) }),
      status: draft.status,
      ...(draft.startDate !== "" && { startDate: draft.startDate }),
      ...(draft.endDate !== "" && { endDate: draft.endDate }),
      ...(memo !== undefined && { memo }),
    },
  };
}

/**
 * 지급 줄 합계와 확정 금액("지급 합계 1,200만원 / 확정 1,250만원 — 50만원 남음").
 * 금액이 비었거나 틀린 줄이 있으면 합계는 null("—"), 확정 견적이 없거나 그 금액이 틀리면 확정은 null이다.
 */
export function summarizePaymentDraft(draft: InteriorItemDraft): {
  paymentTotal: number | null;
  confirmedAmount: number | null;
} {
  const amounts = draft.payments.map((payment) => amountOf(payment.amount));
  const isComplete = amounts.every((amount) => amount !== undefined);
  const confirmed = draft.quotes.find((quote) => quote.id === draft.confirmedQuoteId);
  return {
    paymentTotal: isComplete
      ? amounts.reduce<number>((total, amount) => total + (amount ?? 0), 0)
      : null,
    confirmedAmount: confirmed === undefined ? null : (amountOf(confirmed.amount) ?? null),
  };
}
