import styles from "./HubAccount.module.css";

import type { Household } from "@/lib/types/household";
import type { ListingSourceStatus } from "@/lib/types/listing";
import type { ReactNode } from "react";

type HubAccountProps = {
  status: ListingSourceStatus;
  /** 이 브라우저가 로그인한 적이 있다. 확인 중에 어느 쪽 자리를 지킬지 정한다 */
  hasSessionHint: boolean;
  onAccountRetry: () => void;
  isAccountRetrying: boolean;
  /** 함께 쓰는 중이면 그 요약(로그인 상태에서만), 아니면 null */
  household: Household | null;
  /** 누른 버튼을 넘긴다. 시트를 닫으면 그 버튼으로 포커스가 돌아온다 */
  onHouseholdOpen: (button: HTMLButtonElement) => void;
  onLeave: () => void;
  /** 나가기 요청 중(한 건만 보낸다) */
  isLeaving: boolean;
};

function LoginPrompt() {
  return (
    <p className={styles.reason}>
      로그인하면 저장 목록·인테리어 계획을 여러 기기에서 보고, 다른 사람과 함께 쓸 수 있어요
    </p>
  );
}

type HouseholdRowProps = {
  household: Household | null;
  onHouseholdOpen?: (button: HTMLButtonElement) => void;
  onLeave?: () => void;
  isLeaving?: boolean;
};

/** 계정 줄: 혼자면 저장 상태와 [함께 쓰기](시트), 함께 쓰는 중이면 인원과 [나가기]. 두 모양 모두 한 행(36px)이다. */
function HouseholdRow({
  household,
  onHouseholdOpen,
  onLeave,
  isLeaving = false,
}: HouseholdRowProps) {
  if (household === null) {
    return (
      <div className={styles.row}>
        <p className={styles.status}>카카오 계정에 저장 중</p>
        <button
          type="button"
          className={styles.button}
          aria-haspopup="dialog"
          onClick={(event) => onHouseholdOpen?.(event.currentTarget)}
        >
          함께 쓰기
        </button>
      </div>
    );
  }
  return (
    <div className={styles.row}>
      <p className={styles.status}>{household.memberCount}명이 함께 쓰는 중</p>
      <button
        type="button"
        className={styles.button}
        aria-label="함께 쓰기에서 나가기"
        disabled={isLeaving}
        onClick={onLeave}
      >
        나가기
      </button>
    </div>
  );
}

/**
 * 계정 확인 중에는 확인이 끝나면 들어갈 내용(로그인한 적 있으면 계정 줄, 아니면 로그인 이유)을 보이지 않게 그려 자리만 지킨다.
 * 아래 카드가 확인 뒤에 밀리지 않게 한다. 함께 쓰는지는 확인 전에 알 수 없어 [함께 쓰기] 모양으로 지킨다.
 */
const ACCOUNT_AREA: Record<ListingSourceStatus, (props: HubAccountProps) => ReactNode> = {
  loggedOut: () => <LoginPrompt />,
  loggedIn: ({ household, onHouseholdOpen, onLeave, isLeaving }) => (
    <HouseholdRow
      household={household}
      onHouseholdOpen={onHouseholdOpen}
      onLeave={onLeave}
      isLeaving={isLeaving}
    />
  ),
  loading: ({ hasSessionHint }) => (
    <div className={styles.placeholder} aria-hidden="true" inert>
      {hasSessionHint ? <HouseholdRow household={null} /> : <LoginPrompt />}
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
 * 홈의 계정 자리(카드 아래). 로그아웃이면 로그인하는 이유를, 로그인이면 저장 상태와 함께 쓰기 줄을 둔다. 계정 확인에
 * 실패하면(로그인했던 브라우저) 이유와 [다시 시도]를 둔다. 로그인·[로그아웃] 버튼은 제목 줄에 있다(HubAccountAction).
 */
function HubAccount(props: HubAccountProps) {
  return ACCOUNT_AREA[props.status](props);
}

export default HubAccount;
