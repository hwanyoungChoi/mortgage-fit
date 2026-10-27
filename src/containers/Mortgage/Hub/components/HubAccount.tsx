import KakaoLoginLink from "@/components/KakaoLoginLink";

import styles from "./HubAccount.module.css";

import type { ListingSourceStatus } from "@/lib/types/listing";
import type { ReactNode } from "react";

type HubAccountProps = {
  status: ListingSourceStatus;
  /** 이 브라우저가 로그인한 적이 있다. 확인 중에 어느 쪽 자리를 지킬지 정한다 */
  hasSessionHint: boolean;
};

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

function AccountStatus() {
  return <p className={styles.status}>카카오 계정에 저장 중</p>;
}

/**
 * 계정 확인 중에는 확인이 끝나면 들어갈 내용(로그인한 적 있으면 상태 줄, 아니면 로그인)을 보이지 않게 그려
 * 자리만 지킨다. 아래 카드가 확인 뒤에 밀리지 않게 한다. 계정 확인 실패(error)면 아무것도 두지 않는다.
 */
const ACCOUNT_AREA: Record<ListingSourceStatus, (hasSessionHint: boolean) => ReactNode> = {
  loggedOut: () => <LoginPrompt />,
  loggedIn: () => <AccountStatus />,
  loading: (hasSessionHint) => (
    <div className={styles.placeholder} aria-hidden="true" inert>
      {hasSessionHint ? <AccountStatus /> : <LoginPrompt />}
    </div>
  ),
  error: () => null,
};

/**
 * 홈의 계정 자리(카드 위). 로그아웃이면 카카오 로그인을 주 동작 크기로 두고, 로그인이면 상태 한 줄만 둔다.
 * 로그아웃 버튼은 저장 목록 머리에 있다. 로그인 뒤 돌아오는 곳은 서버가 정한다(`#/listings`).
 */
function HubAccount({ status, hasSessionHint }: HubAccountProps) {
  return ACCOUNT_AREA[status](hasSessionHint);
}

export default HubAccount;
