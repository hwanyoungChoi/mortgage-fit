// 인테리어 플랜의 상한·공종·상태·지급 단계(ADR-029). 공유 검증(server/)의 전이 의존이라
// `@/` 별칭·DOM 타입을 쓰지 않는다. 상한·길이를 올리면 스펙 interior-planner "크기 상한 계산"을 다시 한다.
import { EXTRA_COST_LABEL_MAX_LENGTH } from "./extraCosts";
import { LISTING_NAME_MAX_LENGTH } from "../utils/validateListingName";

import type { InteriorItemStatus, InteriorProcessSource } from "../types/interiorPlan";

/** 계정(가구 범위)·기기마다 플랜 수 상한 */
export const INTERIOR_PLAN_MAX_COUNT = 3;
/** 플랜 하나의 항목 수 상한 */
export const INTERIOR_ITEM_MAX_COUNT = 100;
/** 플랜 만들기(POST)에 함께 넣는 항목 수 상한. 추가 비용 줄 상한(30)과 같고 본문 16KB 안에 든다 */
export const INTERIOR_PLAN_CREATE_MAX_ITEMS = 30;
/** 항목 하나의 견적 수 상한 */
export const INTERIOR_QUOTE_MAX_COUNT = 5;
/** 항목 하나의 지급 줄 수 상한 */
export const INTERIOR_PAYMENT_MAX_COUNT = 5;
/** 플랜 하나의 공간 수 상한(최소 1) */
export const INTERIOR_SPACE_MAX_COUNT = 30;

// 글자 수는 코드포인트 기준(`countChars`), 앞뒤 공백을 뗀 뒤 센다.
/** 플랜 이름. 매물 이름으로 채우므로 매물 이름 상한과 같다 */
export const INTERIOR_PLAN_NAME_MAX_LENGTH = LISTING_NAME_MAX_LENGTH;
export const INTERIOR_SPACE_NAME_MAX_LENGTH = 20;
/** 공종 이름. 추가 비용 줄 이름이 그대로 공종이 되므로 같은 상한이다(변환에 자르기 없음, ADR-029 조건 11) */
export const INTERIOR_TRADE_MAX_LENGTH = EXTRA_COST_LABEL_MAX_LENGTH;
export const INTERIOR_VENDOR_MAX_LENGTH = 30;
export const INTERIOR_CONTACT_MAX_LENGTH = 30;
export const INTERIOR_QUOTE_MEMO_MAX_LENGTH = 200;
export const INTERIOR_ITEM_MEMO_MAX_LENGTH = 500;
export const INTERIOR_PAYMENT_LABEL_MAX_LENGTH = 10;

/**
 * 공종 프리셋 = 공정 순서(14단계). 프리셋 칩 순서·공종별 정렬·[공정 순서] 시트가 모두 이 한 상수에서 나온다.
 * 타일 → 욕실 순이다. 타일↔도장, 도배↔바닥(필름)의 앞뒤는 자료마다 달라 화면에 "업체와 조율"로 안내한다.
 */
export const INTERIOR_TRADES: readonly string[] = [
  "철거",
  "샷시",
  "설비",
  "전기",
  "목공",
  "타일",
  "욕실",
  "도장",
  "필름",
  "도배",
  "바닥",
  "주방가구",
  "조명",
  "입주 청소",
];

/** 화면에 보이는 순서 */
export const INTERIOR_ITEM_STATUSES: readonly InteriorItemStatus[] = [
  "planned",
  "quoting",
  "confirmed",
  "inProgress",
  "done",
];

export const INTERIOR_ITEM_STATUS_LABELS: Record<InteriorItemStatus, string> = {
  planned: "계획",
  quoting: "견적 중",
  confirmed: "확정",
  inProgress: "진행 중",
  done: "완료",
};

/** 지급 줄 이름 칩. 비율은 출처를 확인하지 못해 두지 않는다(스펙 "참고한 사례") */
export const INTERIOR_PAYMENT_LABEL_PRESETS: readonly string[] = ["계약금", "중도금", "잔금"];

/** 공정 순서 출처를 확인한 날 */
export const INTERIOR_PROCESS_BASE_DATE = "2026-10-26";

export const INTERIOR_PROCESS_SOURCES: readonly InteriorProcessSource[] = [
  {
    title: "아정당 — 아파트 리모델링 공사, 소요 기간과 주요 과정 알아보기",
    url: "https://www.ajd.co.kr/contents/basic-tip/detail/아파트_리모델링_공사,_소요_기간과_주요_과정_알아보기-51009",
  },
  {
    title: "월부 커뮤니티 글",
    url: "https://weolbu.com/community/2470493",
  },
];
