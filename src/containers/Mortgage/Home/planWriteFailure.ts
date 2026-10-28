import { INTERIOR_ITEM_MAX_COUNT, INTERIOR_PLAN_MAX_COUNT } from "@/lib/constants/interiorPlan";

import type { InteriorPlanSourceWriteFailure } from "@/lib/types/interiorPlanStore";

type FailureReason = InteriorPlanSourceWriteFailure["reason"];

/** 함께 쓰는 중 404(스펙 "화면 — 상태") */
export const DELETED_IN_HOUSEHOLD_MESSAGE = "함께 쓰는 사람이 삭제한 항목입니다";

/** 같은 항목 동시 편집(스펙 "동기화·이전 규칙"). 시트가 [최신 값 불러오기]를 함께 보인다 */
export const ITEM_CONFLICT_MESSAGE =
  "다른 사람이 고쳤습니다. 저장하지 않았습니다. 최신 값을 불러오면 지금 입력한 내용은 사라집니다";

/** 쓰기 실패 문구. 상한(limit)은 무엇을 더하다 막혔는지에 따라 다르다. 시트는 입력을 그대로 두고 이 문구를 보인다. */
const WRITE_FAILURE_MESSAGES: Record<Exclude<FailureReason, "limit">, string> = {
  unavailable:
    "저장하지 못했습니다. 이 브라우저에서 저장소를 사용할 수 없거나 저장 공간이 가득 찼습니다",
  corrupt: "저장된 인테리어 계획이 손상되어 저장할 수 없습니다",
  notFound: "이 계획이나 항목이 없습니다. 다른 탭이나 기기에서 삭제되었을 수 있습니다",
  invalid: "입력값을 저장할 수 없습니다. 칸을 다시 확인하세요",
  notReady: "계정 상태를 확인한 뒤 다시 시도해 주세요",
  unauthorized: "로그인이 끝나 저장하지 못했습니다. 다시 로그인해 주세요",
  deletedInHousehold: DELETED_IN_HOUSEHOLD_MESSAGE,
  network: "저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요",
  conflict: ITEM_CONFLICT_MESSAGE,
};

/** 목록의 [확정] 체크가 같은 항목 동시 편집에 걸렸을 때. 시트가 아니라 [최신 값 불러오기]가 없다 */
export const CONFIRM_CONFLICT_MESSAGE = "방금 다른 곳에서 바뀌었습니다. 다시 눌러 주세요";

/** 견적 n≥2 옛 항목에서 다른 견적을 확정해 앞선 확정이 풀렸을 때(D2 a) */
export const OTHER_CONFIRM_RELEASED_MESSAGE = "같은 항목의 다른 견적 확정이 풀렸습니다";

export const PLAN_LIMIT_MESSAGE = `계획은 ${INTERIOR_PLAN_MAX_COUNT}개까지 만들 수 있습니다`;
export const ITEM_LIMIT_MESSAGE = `항목은 계획마다 ${INTERIOR_ITEM_MAX_COUNT}개까지 적을 수 있습니다`;

/** 줄 순서 저장 실패 문구의 앞머리(저장 목록 순서 실패와 같은 말) */
const LINE_ORDER_FAILURE = "순서를 저장하지 못해 원래 순서로 되돌렸습니다";

/**
 * 줄 순서 저장(`updatePlan`) 실패 → 목록 위 한 줄. null이면 두지 않는다(401은 홈의 세션 만료 안내가 알린다, ADR-035 조건 5).
 * `conflict`는 `updatePlan`에서 나오지 않는다. 사유가 늘면 타입 검사가 걸린다.
 */
const LINE_ORDER_FAILURE_MESSAGES: Record<Exclude<FailureReason, "conflict">, string | null> = {
  network: `${LINE_ORDER_FAILURE}. 연결을 확인하고 다시 시도해 주세요`,
  unauthorized: null,
  invalid: LINE_ORDER_FAILURE,
  limit: LINE_ORDER_FAILURE,
  unavailable: `${LINE_ORDER_FAILURE}. ${WRITE_FAILURE_MESSAGES.unavailable}`,
  corrupt: `${LINE_ORDER_FAILURE}. ${WRITE_FAILURE_MESSAGES.corrupt}`,
  notFound: `${LINE_ORDER_FAILURE}. ${WRITE_FAILURE_MESSAGES.notFound}`,
  deletedInHousehold: `${LINE_ORDER_FAILURE}. ${WRITE_FAILURE_MESSAGES.deletedInHousehold}`,
  notReady: `${LINE_ORDER_FAILURE}. ${WRITE_FAILURE_MESSAGES.notReady}`,
};

export function lineOrderFailureMessage(reason: FailureReason): string | null {
  // 출처 쓰기 결과 타입이 conflict를 함께 가질 뿐 계획 PATCH에는 조건부 쓰기가 없다
  return reason === "conflict" ? LINE_ORDER_FAILURE : LINE_ORDER_FAILURE_MESSAGES[reason];
}

/** 플랜 만들기는 플랜 상한, 항목 추가는 항목 상한, 그 밖의 쓰기에서는 상한이 생기지 않는다 */
export function planWriteFailureMessage(reason: FailureReason, limitMessage = ""): string {
  return reason === "limit" ? limitMessage : WRITE_FAILURE_MESSAGES[reason];
}
