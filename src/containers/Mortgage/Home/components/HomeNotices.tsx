import { PATHS } from "@/lib/constants/paths";

import styles from "./HomeNotices.module.css";

type HomeNoticesProps = {
  /** 이 화면에서 세션이 끝났다(401) */
  isSessionExpired: boolean;
  /** 로그인했던 브라우저인데 로그인 확인에 실패했다 */
  isAccountError: boolean;
  onAccountRetry: () => void;
  isAccountRetrying: boolean;
  /** 이 기기 계획을 계정으로 옮기지 못한 이유(로그인 상태에서만) */
  importProblem: { message: string; canRetry: boolean } | null;
  onImportRetry: () => void;
  /** 받아 둔 서버 계획은 있는데 다시 조회하지 못했다 */
  isRefreshFailed: boolean;
  /** 한 번 보일 알림(이 기기 계획을 계정으로 옮김) */
  notice: string | null;
};

const SESSION_EXPIRED_MESSAGE = "로그인이 끝났습니다. 다시 로그인해 주세요";

/**
 * [우리 집] 위쪽 안내. 있을 때만 한 줄씩 보이고 평소에는 아무것도 그리지 않는다(저장 목록 제목 아래 안내와 같은 규칙).
 * 로그인은 홈 계정 자리에 있으므로 세션이 끝나면 홈으로 가는 링크를 붙인다(hub-account U4).
 */
function HomeNotices({
  isSessionExpired,
  isAccountError,
  onAccountRetry,
  isAccountRetrying,
  importProblem,
  onImportRetry,
  isRefreshFailed,
  notice,
}: HomeNoticesProps) {
  const hasNotice =
    isSessionExpired ||
    isAccountError ||
    importProblem !== null ||
    isRefreshFailed ||
    notice !== null;
  if (!hasNotice) return null;

  return (
    <div className={styles.notices}>
      {isAccountError && (
        <div className={styles.errorLine}>
          <p role="alert">계정 상태를 확인하지 못했습니다</p>
          <button
            type="button"
            className={styles.retryButton}
            disabled={isAccountRetrying}
            onClick={onAccountRetry}
          >
            다시 시도
          </button>
        </div>
      )}
      {isSessionExpired && (
        <div role="status" className={styles.line}>
          <span>{SESSION_EXPIRED_MESSAGE}</span>
          <a className={styles.lineLink} href={PATHS.hub}>
            홈에서 로그인
          </a>
        </div>
      )}
      {importProblem !== null && (
        <div className={styles.errorLine}>
          <p role="alert">{importProblem.message}</p>
          {importProblem.canRetry && (
            <button type="button" className={styles.retryButton} onClick={onImportRetry}>
              다시 시도
            </button>
          )}
        </div>
      )}
      {isRefreshFailed && (
        <p className={styles.warning}>
          최신 계획을 불러오지 못했습니다. 마지막으로 불러온 계획입니다
        </p>
      )}
      {notice !== null && (
        <p role="status" className={styles.line}>
          {notice}
        </p>
      )}
    </div>
  );
}

export default HomeNotices;
