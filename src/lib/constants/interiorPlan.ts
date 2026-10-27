// 인테리어 플랜의 상한·공종·상태·지급 단계(ADR-029). 공유 검증(server/)의 전이 의존이라
// `@/` 별칭·DOM 타입을 쓰지 않는다. 상한·길이를 올리면 스펙 interior-planner "크기 상한 계산"을 다시 한다.
import { EXTRA_COST_LABEL_MAX_LENGTH } from "./extraCosts";
import { LISTING_NAME_MAX_LENGTH } from "../utils/validateListingName";

import type { InteriorItemStatus } from "../types/interiorPlan";

/** 원 = 만원 × 이 값. 옛 키(`amount`·`budget`·항목 `budget`, 만원)를 원으로 읽을 때 `interiorPlanRows`가 쓴다(ADR-034) */
export const WON_PER_MANWON = 10_000;
/**
 * 원 단위 금액(`amountWon`·`budgetWon`) 상한, 13자리. 옛 만원 상한 999,999,999 × 10,000을 담고,
 * 항목 100개를 더해도 `Number.MAX_SAFE_INTEGER` 안이다(ADR-034 조건 3)
 */
export const MAX_WON = 9_999_999_999_999;

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

/** 화면에 보이는 순서 */
export const INTERIOR_ITEM_STATUSES: readonly InteriorItemStatus[] = [
  "planned",
  "quoting",
  "confirmed",
  "inProgress",
  "done",
];
