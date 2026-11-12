import KakaoLoginLink from "@/components/KakaoLoginLink";
import Skeleton from "@/components/Skeleton";
import { useMe } from "@/hooks/useMe";

import styles from "./HubAccountAction.module.css";

import type { ListingSourceStatus } from "@/lib/types/listing";

type HubAccountActionProps = {
  status: ListingSourceStatus;
  onLogout: () => void;
  /** 로그아웃 요청 중(한 건만 보낸다) */
  isLoggingOut: boolean;
};

const LOGOUT_DESCRIPTION_ID = "hub-logout-description";

/**
 * 홈 제목 줄 오른쪽의 계정 버튼(다른 화면 머리글 버튼과 같은 자리·크기). 로그아웃이면 카카오 로그인, 로그인이면 카카오 닉네임(있을 때)과 [로그아웃]이다.
 * 확인 중(홈을 드러내기 전)에는 버튼 높이의 막대로 자리를 지키고, 확인 실패면 비워 둔다. 제목 줄 높이는 제목이 지키므로 아래가 밀리지 않는다.
 * 로그인 뒤 돌아오는 곳은 서버가 정한다(`#/`).
 */
function HubAccountAction({ status, onLogout, isLoggingOut }: HubAccountActionProps) {
  const { data: me } = useMe();
  const nickname = me?.user?.nickname;
  if (status === "loggedOut") return <KakaoLoginLink />;
  if (status === "loading") {
    return <Skeleton width="104px" height="36px" radius="var(--radius-small)" isOnBackground />;
  }
  if (status !== "loggedIn") return null;
  return (
    <div className={styles.account}>
      {nickname !== undefined && (
        <span className={styles.nickname} title={nickname}>
          <span className={styles.visuallyHidden}>로그인 계정 </span>
          {nickname}
        </span>
      )}
      <button
        type="button"
        className={styles.button}
        disabled={isLoggingOut}
        aria-describedby={LOGOUT_DESCRIPTION_ID}
        onClick={onLogout}
      >
        로그아웃
      </button>
      {/* 화면에는 두지 않고 보조기기에만 버튼 설명으로 읽힌다. */}
      <span id={LOGOUT_DESCRIPTION_ID} className={styles.visuallyHidden}>
        로그아웃하면 이 기기에 있던 저장 목록·예산 계획으로 돌아갑니다
      </span>
    </div>
  );
}

export default HubAccountAction;
