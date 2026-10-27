import { INTERIOR_PLAN_MAX_COUNT } from "@/lib/constants/interiorPlan";

import type {
  InteriorPlanImportFailureReason,
  InteriorPlanImportSkipReason,
  InteriorPlanImportState,
} from "@/lib/types/interiorPlanImport";

const FAILURE_REASONS: Record<InteriorPlanImportFailureReason, string> = {
  limit: `계정에는 계획을 ${INTERIOR_PLAN_MAX_COUNT}개까지 저장할 수 있습니다`,
  network: "연결을 확인하고 다시 시도해 주세요",
  tooLarge:
    "계획이 너무 커서 옮길 수 없습니다. 홈에서 로그아웃한 뒤 메모를 줄이면 다음 로그인 때 옮깁니다",
};

/** 다시 해도 같은 결과면 [다시 시도]를 보이지 않는다 */
const CAN_RETRY: Record<InteriorPlanImportFailureReason, boolean> = {
  limit: true,
  network: true,
  tooLarge: false,
};

/** null이면 알리지 않는다(함께 쓰는 중 건너뛰기는 문제가 아니다). */
const SKIP_MESSAGES: Record<InteriorPlanImportSkipReason, string | null> = {
  corrupt:
    "이 기기의 인테리어 계획이 손상되어 계정으로 옮기지 못했습니다. 홈에서 로그아웃하면 우리 집에서 손상된 원문을 복사할 수 있습니다",
  unavailable:
    "이 브라우저에서는 저장소를 사용할 수 없어 이 기기의 인테리어 계획을 계정으로 옮기지 못했습니다",
  household: null,
  serverHousehold: null,
};

/**
 * 이 기기 계획을 계정으로 옮기지 못한 이유. 문제가 없으면 null.
 * 연결·상한 실패는 다시 시도할 수 있고(옮긴 것은 기록돼 있어 남은 것만 보낸다), 손상·접근 불가·크기 초과는 다시 해도 같다.
 */
export function interiorPlanImportProblem(
  state: InteriorPlanImportState | null,
): { message: string; canRetry: boolean } | null {
  if (state?.status === "failed") {
    return {
      message: `이 기기의 인테리어 계획 ${state.failedCount}개를 옮기지 못했습니다. ${FAILURE_REASONS[state.reason]}`,
      canRetry: CAN_RETRY[state.reason],
    };
  }
  if (state?.status !== "skipped") return null;
  const message = SKIP_MESSAGES[state.reason];
  return message === null ? null : { message, canRetry: false };
}
