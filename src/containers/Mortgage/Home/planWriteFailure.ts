import { INTERIOR_ITEM_MAX_COUNT, INTERIOR_PLAN_MAX_COUNT } from "@/lib/constants/interiorPlan";

import type { InteriorPlanWriteFailure } from "@/lib/types/interiorPlanStore";

type FailureReason = InteriorPlanWriteFailure["reason"];

/** 쓰기 실패 문구. 상한(limit)은 무엇을 더하다 막혔는지에 따라 다르다. 시트는 입력을 그대로 두고 이 문구를 보인다. */
const WRITE_FAILURE_MESSAGES: Record<Exclude<FailureReason, "limit">, string> = {
  unavailable:
    "저장하지 못했습니다. 이 브라우저에서 저장소를 사용할 수 없거나 저장 공간이 가득 찼습니다",
  corrupt: "저장된 인테리어 계획이 손상되어 저장할 수 없습니다",
  notFound: "이 계획이나 항목이 없습니다. 다른 탭에서 삭제되었을 수 있습니다",
  invalid: "입력값을 저장할 수 없습니다. 칸을 다시 확인하세요",
};

export const PLAN_LIMIT_MESSAGE = `계획은 ${INTERIOR_PLAN_MAX_COUNT}개까지 만들 수 있습니다`;
export const ITEM_LIMIT_MESSAGE = `항목은 계획마다 ${INTERIOR_ITEM_MAX_COUNT}개까지 적을 수 있습니다`;

/** 플랜 만들기는 플랜 상한, 항목 추가는 항목 상한, 그 밖의 쓰기에서는 상한이 생기지 않는다 */
export function planWriteFailureMessage(reason: FailureReason, limitMessage = ""): string {
  return reason === "limit" ? limitMessage : WRITE_FAILURE_MESSAGES[reason];
}
