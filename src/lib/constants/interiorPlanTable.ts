// 인테리어 계획 표 내보내기(스펙 interior-planner "표 내보내기", 태스크 5)의 열 제목·문구.
// 계약 3파일(`interiorPlan.ts` 타입·상수·검증)에는 더하지 않는다(AC-12(f)).

/** 표의 열(화면·인쇄·CSV 같은 순서) */
export type InteriorPlanTableColumn =
  "trade" | "vendor" | "detail" | "quote" | "confirmed" | "done" | "note";

export const INTERIOR_PLAN_TABLE_COLUMNS: readonly InteriorPlanTableColumn[] = [
  "trade",
  "vendor",
  "detail",
  "quote",
  "confirmed",
  "done",
  "note",
];

/** 열 제목. 금액의 "원"은 열 제목에만 쓴다(U20) */
export const INTERIOR_PLAN_TABLE_COLUMN_LABELS: Record<InteriorPlanTableColumn, string> = {
  trade: "구분",
  vendor: "업체",
  detail: "세부내용",
  quote: "견적(원)",
  confirmed: "확정(원)",
  done: "완료(원)",
  note: "비고",
};

/** 금액 키가 없는 견적(ADR-033)의 표시 글자. 목록·표·CSV·인쇄·홈이 같이 쓴다(U4). 표·CSV·인쇄의 업체 미정 칸도 이 글자다 */
export const INTERIOR_PLAN_TBD_LABEL = "미정";

/** 업체 키가 없는 견적(ADR-036)의 목록 글자. 목록에는 열 제목이 없어 "업체"를 붙인다(U1) */
export const INTERIOR_VENDOR_TBD_LABEL = "업체 미정";

/** 맨 아래 합계 줄의 첫 칸 */
export const INTERIOR_PLAN_TABLE_TOTAL_LABEL = "계";

/** 표 머리 조각을 잇는 구분자(앞뒤 공백 포함 가운뎃점) */
export const INTERIOR_PLAN_TABLE_SEPARATOR = " · ";

/** 표 머리(화면·인쇄). 금액 인자는 `formatWon` 글자(예: "1,234,500원")다(U8) */
export const INTERIOR_PLAN_TABLE_HEADING = {
  title: (planName: string) => `${planName} 인테리어 계획`,
  basis: (today: string) => `${today} 기준`,
  budget: (won: string) => `총 예산 ${won}`,
  plannedTotal: (won: string) => `지출 예정 ${won}`,
  doneTotal: (won: string) => `지출 완료 ${won}`,
  remaining: (won: string) => `남은 예산 ${won}`,
  overBudget: (won: string) => `예산 초과 ${won}`,
};

/** 내려받는 파일 이름 `{이름}-인테리어-{YYYY-MM-DD}.csv`의 고정 부분(U20) */
export const INTERIOR_PLAN_EXPORT_FILE_LABEL = "인테리어";
export const INTERIOR_PLAN_EXPORT_FILE_EXTENSION = ".csv";

/** 표 보기 버튼 줄 아래 안내 한 줄(줄 0개면 없음, U21) */
export const INTERIOR_PLAN_EXPORT_NOTICE = "내려받기·인쇄가 안 되면 Safari·Chrome에서 열어 주세요";

/** 표 보기의 줄 0개 안내(표 보기에는 [줄 추가]가 없어 목록 보기로 안내한다) */
export const INTERIOR_PLAN_TABLE_EMPTY_MESSAGE = "[목록]의 [줄 추가]로 적으면 여기에 표로 보입니다";

/** 가로 스크롤 영역의 접근 가능한 이름 */
export const INTERIOR_PLAN_TABLE_SCROLL_LABEL = "계획 표 (가로로 스크롤)";
