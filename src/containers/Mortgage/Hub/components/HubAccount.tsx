import ChevronRight from "lucide-react/icons/chevron-right";
import { useId } from "react";

import styles from "./HubAccount.module.css";
import cardStyles from "./HubCard.module.css";

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
};

/**
 * 함께 쓰기 줄: 기능 카드 아래 따로 놓은 흰 면 한 줄(iOS 설정의 따로 묶인 칸). 누르면 함께 쓰기 시트가 열린다.
 * 혼자면 초대 안내, 함께 쓰는 중이면 인원이 설명 줄에 보이고, [나가기]는 시트 안에 있다.
 * 이름은 제목("함께 쓰기")만이고 설명 줄은 aria-describedby로 읽힌다(기능 카드와 같은 규칙).
 */
function HouseholdRow({ household, onHouseholdOpen }: HouseholdRowProps) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <button
      type="button"
      className={styles.householdCard}
      aria-haspopup="dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClick={(event) => onHouseholdOpen?.(event.currentTarget)}
    >
      <span id={titleId} className={cardStyles.title}>
        함께 쓰기
      </span>
      <ChevronRight className={cardStyles.chevron} size={20} aria-hidden="true" />
      <span id={descriptionId} className={cardStyles.description}>
        {household === null
          ? "초대한 사람과 저장 목록·인테리어 계획을 함께 씁니다"
          : `${household.memberCount}명이 함께 쓰는 중`}
      </span>
    </button>
  );
}

/**
 * 계정 확인 중에는 확인이 끝나면 들어갈 내용(로그인한 적 있으면 계정 줄, 아니면 로그인 이유)을 보이지 않게 그려 자리만 지킨다.
 * 아래 카드가 확인 뒤에 밀리지 않게 한다. 함께 쓰는지는 확인 전에 알 수 없어 [함께 쓰기] 모양으로 지킨다.
 */
const ACCOUNT_AREA: Record<ListingSourceStatus, (props: HubAccountProps) => ReactNode> = {
  loggedOut: () => <LoginPrompt />,
  loggedIn: ({ household, onHouseholdOpen }) => (
    <HouseholdRow household={household} onHouseholdOpen={onHouseholdOpen} />
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
 * 홈의 계정 자리(카드 아래). 로그아웃이면 로그인하는 이유를, 로그인이면 함께 쓰기 줄(흰 면)을 둔다. 계정 확인에
 * 실패하면(로그인했던 브라우저) 이유와 [다시 시도]를 둔다. 로그인·[로그아웃] 버튼은 제목 줄에 있다(HubAccountAction).
 */
function HubAccount(props: HubAccountProps) {
  return ACCOUNT_AREA[props.status](props);
}

export default HubAccount;
