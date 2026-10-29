// 줄 시트(스펙 interior-simple "줄 시트")의 입력 상태와 검증을 통과한 값.
// 입력은 칸 그대로의 문자열이고, 저장할 때 검증해 `InteriorLineValues`로 바꾼다. 빈 문자열 = 입력 안 함.

export type InteriorLineDraft = {
  /** 구분(공정). 이 계획의 기존 구분이 제안으로 뜬다 */
  trade: string;
  /** 빈칸 = 업체 미정(ADR-036) */
  vendor: string;
  /** 쉼표를 뺀 견적 금액(원). 빈칸 = 금액 미정(ADR-033) */
  amount: string;
  /** 세부내용 = 그 견적의 메모 */
  detail: string;
  /** 시작일 = 항목 `startDate`(YYYY-MM-DD, 날짜 칸 값). 빈칸 = 없음 */
  startDate: string;
  /** 끝나는 날 = 항목 `endDate`. 빈칸 = 없음(하루 일정) */
  endDate: string;
  /** 비고 = 항목 메모 */
  note: string;
  isConfirmed: boolean;
};

/** 오류를 보일 칸(화면 순서) */
export type InteriorLineDraftField =
  "trade" | "detail" | "vendor" | "amount" | "startDate" | "endDate" | "note";

/** 칸 하나의 오류. 목록 순서 = 화면 순서(제출 실패 시 첫 오류로 포커스를 옮긴다) */
export type InteriorLineDraftError = { field: InteriorLineDraftField; message: string };

/** 검증을 통과한 줄 값. 글자는 앞뒤 공백을 뗐고, 비운 선택 칸(업체·견적·세부내용·비고)은 undefined다 */
export type InteriorLineValues = {
  trade: string;
  /** 없으면 업체 미정(업체 칸을 비움, ADR-036) */
  vendor?: string;
  /** 원 정수 0~MAX_WON(ADR-034). 없으면 금액 미정(견적 칸을 비움, ADR-033) */
  amountWon?: number;
  detail?: string;
  /** YYYY-MM-DD. 없으면 일정 없음 */
  startDate?: string;
  /** YYYY-MM-DD, 시작일과 같거나 뒤 */
  endDate?: string;
  note?: string;
  isConfirmed: boolean;
};
