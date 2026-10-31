import KakaoLoginLink from "@/components/KakaoLoginLink";

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
 * 홈 제목 줄 오른쪽의 계정 버튼(다른 화면 머리글 버튼과 같은 자리·크기). 로그아웃이면 카카오 로그인, 로그인이면 [로그아웃]이다.
 * 계정 확인 중·확인 실패면 비워 둔다. 제목 줄 높이는 제목이 지키므로 아래가 밀리지 않는다.
 * 로그인 뒤 돌아오는 곳은 서버가 정한다(`#/`).
 */
function HubAccountAction({ status, onLogout, isLoggingOut }: HubAccountActionProps) {
  if (status === "loggedOut") return <KakaoLoginLink />;
  if (status !== "loggedIn") return null;
  return (
    <>
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
        로그아웃하면 이 기기에 있던 저장 목록·인테리어 계획으로 돌아갑니다
      </span>
    </>
  );
}

export default HubAccountAction;
