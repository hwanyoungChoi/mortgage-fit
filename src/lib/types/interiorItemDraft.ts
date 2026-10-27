import type { InteriorItemStatus } from "./interiorPlan";

// 항목 시트의 입력 상태. 금액·날짜·글자는 입력 그대로의 문자열이고, 저장할 때 검증해 `InteriorItemInput`으로 바꾼다.
// 빈 문자열 = 입력 안 함(선택 필드는 키를 쓰지 않는다).

export type InteriorQuoteDraft = {
  id: string;
  vendor: string;
  contact: string;
  /** 쉼표를 뺀 금액 입력 */
  amount: string;
  memo: string;
};

export type InteriorPaymentDraft = {
  id: string;
  label: string;
  amount: string;
  /** `YYYY-MM-DD` 또는 빈 문자열(`<input type="date">` 값) */
  dueDate: string;
  isPaid: boolean;
};

export type InteriorItemDraft = {
  spaceId: string;
  trade: string;
  budget: string;
  quotes: InteriorQuoteDraft[];
  /** 확정한 견적 id. 없으면 null */
  confirmedQuoteId: string | null;
  payments: InteriorPaymentDraft[];
  status: InteriorItemStatus;
  startDate: string;
  endDate: string;
  memo: string;
};

/** 오류를 보일 칸. 견적·지급 칸은 줄 id로 구분한다 */
export type InteriorItemDraftField =
  | "spaceId"
  | "trade"
  | "budget"
  | `quote:${string}:${"vendor" | "contact" | "amount" | "memo"}`
  | `payment:${string}:${"label" | "amount" | "dueDate"}`
  | "startDate"
  | "endDate"
  | "memo";

/** 칸 하나의 오류. 목록 순서 = 화면 순서(제출 실패 시 첫 오류로 포커스를 옮긴다) */
export type InteriorItemDraftError = { field: InteriorItemDraftField; message: string };
