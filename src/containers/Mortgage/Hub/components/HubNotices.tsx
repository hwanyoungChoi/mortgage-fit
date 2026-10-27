import styles from "./HubNotices.module.css";

import type { LoginResult } from "@/lib/types/route";
import type { Ref } from "react";

/** 계정 자리에서 한 일의 결과. 동시에 하나만 보이고, 새 동작을 시작하면 지운다. */
export type HubResult = LoginResult | "logoutFailed" | "householdLeft" | "leaveFailed";

const RESULT_LINES: Record<HubResult, { message: string; isError: boolean }> = {
  cancelled: { message: "로그인을 취소했습니다", isError: false },
  failed: { message: "로그인하지 못했습니다. 다시 시도해 주세요", isError: false },
  notConfigured: { message: "로그인을 준비 중입니다", isError: false },
  logoutFailed: {
    message: "로그아웃하지 못했습니다. 연결을 확인하고 다시 시도해 주세요",
    isError: true,
  },
  householdLeft: { message: "함께 쓰기에서 나왔습니다", isError: false },
  leaveFailed: {
    message: "함께 쓰기에서 나가지 못했습니다. 연결을 확인하고 다시 시도해 주세요",
    isError: true,
  },
};

const SESSION_EXPIRED_MESSAGE = "로그인이 끝났습니다. 다시 로그인해 주세요";

type HubNoticesProps = {
  /** 포커스를 옮길 줄을 찾는 자리(줄마다 `tabIndex=-1`) */
  ref: Ref<HTMLDivElement>;
  result: HubResult | null;
  /** 실패 줄(로그아웃·나가기)은 아직 로그인 상태일 때만 의미가 있다. 그 뒤 세션이 끝나면 지운다 */
  isLoggedIn: boolean;
  /** 홈의 매물·계획 출처 중 하나라도 세션이 끝났다(401). 한 줄로 합친다 */
  isSessionExpired: boolean;
  /** 이 기기 매물을 계정으로 옮기지 못한 이유(로그인 상태에서만) */
  importProblem: { message: string; canRetry: boolean } | null;
  onImportRetry: () => void;
};

/**
 * 홈 계정 자리 바로 아래 안내. 결과 줄(하나) → 상태에서 나오는 줄(세션 만료·매물 이전 실패) 순서로, 있을 때만 한 줄씩 보인다.
 * 저장 목록 제목 아래 안내와 같은 모양이다.
 */
function HubNotices({
  ref,
  result,
  isLoggedIn,
  isSessionExpired,
  importProblem,
  onImportRetry,
}: HubNoticesProps) {
  const resultLine = result === null ? null : RESULT_LINES[result];
  const visibleResultLine = resultLine?.isError && !isLoggedIn ? null : resultLine;
  if (visibleResultLine === null && !isSessionExpired && importProblem === null) return null;

  return (
    <div ref={ref} className={styles.notices}>
      {visibleResultLine !== null && (
        <p
          role={visibleResultLine.isError ? "alert" : "status"}
          tabIndex={-1}
          className={visibleResultLine.isError ? styles.errorLine : styles.line}
        >
          {visibleResultLine.message}
        </p>
      )}
      {isSessionExpired && (
        <p role="status" tabIndex={-1} className={styles.line}>
          {SESSION_EXPIRED_MESSAGE}
        </p>
      )}
      {importProblem !== null && (
        <div className={styles.errorLine}>
          <p role="alert" tabIndex={-1}>
            {importProblem.message}
          </p>
          {importProblem.canRetry && (
            <button type="button" className={styles.retryButton} onClick={onImportRetry}>
              다시 시도
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default HubNotices;
