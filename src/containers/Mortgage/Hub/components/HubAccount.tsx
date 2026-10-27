import KakaoLoginLink from "@/components/KakaoLoginLink";

import styles from "./HubAccount.module.css";

import type { ListingSourceStatus } from "@/lib/types/listing";
import type { ReactNode } from "react";

type HubAccountProps = {
  status: ListingSourceStatus;
  /** 이 브라우저가 로그인한 적이 있다. 확인 중에 어느 쪽 자리를 지킬지 정한다 */
  hasSessionHint: boolean;
  onLogout: () => void;
  /** 로그아웃 요청 중(한 건만 보낸다) */
  isLoggingOut: boolean;
  onAccountRetry: () => void;
  isAccountRetrying: boolean;
};

const LOGOUT_DESCRIPTION_ID = "hub-logout-description";

function LoginPrompt() {
  return (
    <div className={styles.login}>
      <p className={styles.reason}>
        로그인하면 저장 목록·인테리어 계획을 여러 기기에서 함께 볼 수 있어요
      </p>
      <KakaoLoginLink isWide />
    </div>
  );
}

type AccountRowProps = {
  /** 확인 중 자리표시자: 같은 마크업을 보이지 않게 그리고 버튼을 연결하지 않는다 */
  isHidden: boolean;
  onLogout?: () => void;
  isLoggingOut?: boolean;
};

function AccountRow({ isHidden, onLogout, isLoggingOut = false }: AccountRowProps) {
  return (
    <div className={styles.row}>
      <p className={styles.status}>카카오 계정에 저장 중</p>
      <button
        type="button"
        className={styles.button}
        disabled={isLoggingOut}
        aria-describedby={isHidden ? undefined : LOGOUT_DESCRIPTION_ID}
        onClick={onLogout}
      >
        로그아웃
      </button>
      {/* 화면에는 두지 않고 보조기기에만 버튼 설명으로 읽힌다. */}
      {!isHidden && (
        <span id={LOGOUT_DESCRIPTION_ID} className={styles.visuallyHidden}>
          로그아웃하면 이 기기에 있던 저장 목록·인테리어 계획으로 돌아갑니다
        </span>
      )}
    </div>
  );
}

/**
 * 계정 확인 중에는 확인이 끝나면 들어갈 내용(로그인한 적 있으면 상태 줄, 아니면 로그인)을 보이지 않게 그려
 * 자리만 지킨다. 아래 카드가 확인 뒤에 밀리지 않게 한다.
 */
const ACCOUNT_AREA: Record<ListingSourceStatus, (props: HubAccountProps) => ReactNode> = {
  loggedOut: () => <LoginPrompt />,
  loggedIn: ({ onLogout, isLoggingOut }) => (
    <AccountRow isHidden={false} onLogout={onLogout} isLoggingOut={isLoggingOut} />
  ),
  loading: ({ hasSessionHint }) => (
    <div className={styles.placeholder} aria-hidden="true" inert>
      {hasSessionHint ? <AccountRow isHidden /> : <LoginPrompt />}
    </div>
  ),
  error: ({ onAccountRetry, isAccountRetrying }) => (
    <div className={styles.row}>
      <p role="alert" className={styles.error}>
        계정 상태를 확인하지 못했습니다
      </p>
      <button
        type="button"
        className={styles.button}
        disabled={isAccountRetrying}
        onClick={onAccountRetry}
      >
        다시 시도
      </button>
    </div>
  ),
};

/**
 * 홈의 계정 자리(카드 위). 로그아웃이면 카카오 로그인을 주 동작 크기로 두고, 로그인이면 상태 줄과 [로그아웃]을 둔다.
 * 계정 확인에 실패하면(로그인했던 브라우저) 이유와 [다시 시도]를 둔다. 로그인 뒤 돌아오는 곳은 서버가 정한다(`#/`).
 */
function HubAccount(props: HubAccountProps) {
  return ACCOUNT_AREA[props.status](props);
}

export default HubAccount;
