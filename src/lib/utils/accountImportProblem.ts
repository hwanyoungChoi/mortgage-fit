import type {
  AccountImportFailureReason,
  AccountImportSkipReason,
  AccountImportState,
} from "@/lib/types/accountImport";

const FAILURE_REASONS: Record<AccountImportFailureReason, string> = {
  limit: "계정에는 매물을 500개까지 저장할 수 있습니다",
  network: "연결을 확인하고 다시 시도해 주세요",
};

/** null이면 알리지 않는다(함께 쓰는 중 건너뛰기는 문제가 아니다). */
const SKIP_MESSAGES: Record<AccountImportSkipReason, string | null> = {
  corrupt:
    "이 기기의 저장 목록이 손상되어 계정으로 옮기지 못했습니다. 홈에서 로그아웃하면 저장 목록에서 손상된 원문을 복사할 수 있습니다",
  unavailable:
    "이 브라우저에서는 저장소를 사용할 수 없어 이 기기의 매물을 계정으로 옮기지 못했습니다",
  household: null,
};

/**
 * 이 기기 매물을 계정으로 옮기지 못한 이유. 문제가 없으면 null. 저장 목록과 홈(로그인 뒤 착지)이 같은 문구를 보인다.
 * 실패는 다시 시도할 수 있고(옮긴 것은 기록돼 있어 남은 것만 보낸다), 손상·접근 불가는 다시 해도 같다.
 */
export function accountImportProblem(
  state: AccountImportState | null,
): { message: string; canRetry: boolean } | null {
  if (state?.status === "failed") {
    return {
      message: `이 기기의 매물 ${state.failedCount}개를 옮기지 못했습니다. ${FAILURE_REASONS[state.reason]}`,
      canRetry: true,
    };
  }
  if (state?.status !== "skipped") return null;
  const message = SKIP_MESSAGES[state.reason];
  return message === null ? null : { message, canRetry: false };
}
