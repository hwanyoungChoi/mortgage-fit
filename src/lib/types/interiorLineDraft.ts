// 줄 시트(스펙 interior-simple "줄 시트")의 입력 상태와 검증을 통과한 값.
// 입력은 칸 그대로의 문자열이고, 저장할 때 검증해 `InteriorLineValues`로 바꾼다. 빈 문자열 = 입력 안 함.

export type InteriorLineDraft = {
  /** 구분(공정). 이 계획의 기존 구분이 제안으로 뜬다 */
  trade: string;
  vendor: string;
  /** 쉼표를 뺀 견적 금액(만원) */
  amount: string;
  /** 세부내용 = 그 견적의 메모 */
  detail: string;
  /** 비고 = 항목 메모 */
  note: string;
  isConfirmed: boolean;
};

/** 오류를 보일 칸(화면 순서) */
export type InteriorLineDraftField = "trade" | "detail" | "vendor" | "amount" | "note";

/** 칸 하나의 오류. 목록 순서 = 화면 순서(제출 실패 시 첫 오류로 포커스를 옮긴다) */
export type InteriorLineDraftError = { field: InteriorLineDraftField; message: string };

/** 검증을 통과한 줄 값. 글자는 앞뒤 공백을 뗐고, 비운 선택 칸(세부내용·비고)은 undefined다 */
export type InteriorLineValues = {
  trade: string;
  vendor: string;
  /** 만원 정수 1~999,999,999 */
  amount: number;
  detail?: string;
  note?: string;
  isConfirmed: boolean;
};
