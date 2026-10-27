import { PATHS } from "@/lib/constants/paths";

import styles from "./HeaderNotices.module.css";

import type { ListingSourceStatus } from "@/lib/types/listing";

type HeaderNoticesProps = {
  accountStatus: ListingSourceStatus;
  isSessionExpired: boolean;
  onAccountRetry: () => void;
  isAccountRetrying: boolean;
  /** 이 기기 매물을 계정으로 옮기지 못한 이유(로그인 상태에서만) */
  importProblem: { message: string; canRetry: boolean } | null;
  onImportRetry: () => void;
  /** 다른 화면이나 이전이 남긴 알림(공유받은 매물 추가, 계정으로 옮김) */
  notice: string | null;
  /** 목록 밖에 남겨야 하는 쓰기 실패(로그인이 끝나 카드가 사라져도 보이게) */
  writeError: string | null;
};

const SESSION_EXPIRED_MESSAGE = "로그인이 끝났습니다. 다시 로그인해 주세요";

/**
 * 저장 목록 제목 줄 아래 안내. 있을 때만 한 줄씩 보이고 평소에는 아무것도 그리지 않는다.
 * 로그인·로그아웃은 홈 계정 자리에 있다. 세션이 끝나면 홈으로 가는 링크를 붙인다(hub-account U4).
 */
function HeaderNotices({
  accountStatus,
  isSessionExpired,
  onAccountRetry,
  isAccountRetrying,
  importProblem,
  onImportRetry,
  notice,
  writeError,
}: HeaderNoticesProps) {
  const isAccountError = accountStatus === "error";
  const hasNotice =
    isAccountError ||
    isSessionExpired ||
    importProblem !== null ||
    notice !== null ||
    writeError !== null;
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
      {notice !== null && (
        <p role="status" className={styles.line}>
          {notice}
        </p>
      )}
      {writeError !== null && (
        <p role="alert" className={styles.errorLine}>
          {writeError}
        </p>
      )}
    </div>
  );
}

export default HeaderNotices;
