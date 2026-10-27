import LinkCopyActions from "@/components/LinkCopyActions";
import styles from "@/components/SheetBody.module.css";

import { useRevokeHouseholdInvite } from "../hooks/useRevokeHouseholdInvite";

import type { CreateHouseholdInviteResponse } from "@/lib/types/household";

type HouseholdInviteResultProps = {
  invite: CreateHouseholdInviteResponse;
};

const REVOKE_CONFIRM_MESSAGE =
  "이 초대를 끊을까요? 받은 사람은 이 링크로 함께 쓰기를 시작할 수 없습니다.";

/**
 * 만든 초대 링크. 공유 링크 결과(`ShareLinkResult`)와 같은 모양이다. 끊은 뒤에는 링크·복사·공유하기를 모두 없앤다.
 * 서버는 토큰 해시만 두므로 시트를 닫으면 이 링크를 다시 볼 수 없다(새로 만들면 이 링크는 끊긴다).
 */
function HouseholdInviteResult({ invite }: HouseholdInviteResultProps) {
  const revokeInvite = useRevokeHouseholdInvite();

  const handleRevoke = () => {
    if (!window.confirm(REVOKE_CONFIRM_MESSAGE)) return;
    revokeInvite.mutate();
  };

  if (revokeInvite.isSuccess) {
    return (
      <p role="status" className={styles.notice}>
        초대를 끊었습니다. 이 링크는 더 이상 열리지 않습니다
      </p>
    );
  }

  return (
    <>
      <LinkCopyActions
        url={invite.url}
        label="초대 링크"
        shareTitle="모기지핏 함께 쓰는 목록 초대"
      />
      <p className={styles.hint}>
        7일 동안 한 번 쓸 수 있습니다. 받은 사람이 카카오로 로그인해 수락하면 같은 목록과 인테리어
        계획을 함께 씁니다. 이 창을 닫으면 링크를 다시 볼 수 없어요.
      </p>
      {revokeInvite.isError && (
        <p role="alert" className={styles.error}>
          초대를 끊지 못했습니다. 연결을 확인하고 다시 시도해 주세요
        </p>
      )}
      <button
        type="button"
        className={styles.dangerButton}
        disabled={revokeInvite.isPending}
        onClick={handleRevoke}
      >
        {revokeInvite.isPending ? "초대를 끊는 중" : "이 초대 끊기"}
      </button>
    </>
  );
}

export default HouseholdInviteResult;
