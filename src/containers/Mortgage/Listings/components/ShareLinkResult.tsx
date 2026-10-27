import LinkCopyActions from "@/components/LinkCopyActions";
import styles from "@/components/SheetBody.module.css";

import { useRevokeShare } from "../hooks/useRevokeShare";

import type { SentShareStore } from "@/lib/types/sentShare";
import type { CreateShareResponse } from "@/lib/types/share";

type ShareLinkResultProps = {
  share: CreateShareResponse;
  sentShareStore: SentShareStore;
};

const REVOKE_CONFIRM_MESSAGE = "이 링크를 끊을까요? 이미 받은 사람도 더 이상 열 수 없습니다.";

/**
 * 만든 공유 링크. 끊은 뒤에는 링크·복사·공유하기를 모두 없애 끊긴 링크를 보내지 않게 한다. 닫기는 시트 머리글에 있다.
 */
function ShareLinkResult({ share, sentShareStore }: ShareLinkResultProps) {
  const revokeShare = useRevokeShare(sentShareStore);

  const handleRevoke = () => {
    if (!window.confirm(REVOKE_CONFIRM_MESSAGE)) return;
    revokeShare.mutate({ token: share.token, ownerKey: share.ownerKey });
  };

  if (revokeShare.isSuccess) {
    return (
      <p role="status" className={styles.notice}>
        링크를 끊었습니다. 이 링크는 더 이상 열리지 않습니다
      </p>
    );
  }

  return (
    <>
      <LinkCopyActions url={share.url} label="공유 링크" shareTitle="모기지핏 매물 공유" />
      <p className={styles.hint}>
        30일 동안 열 수 있습니다. 받은 사람 목록에 복사본으로 들어가며, 이후 내가 고쳐도 바뀌지
        않습니다.
      </p>
      {revokeShare.isError && (
        <p role="alert" className={styles.error}>
          링크를 끊지 못했습니다. 연결을 확인하고 다시 시도해 주세요
        </p>
      )}
      <button
        type="button"
        className={styles.dangerButton}
        disabled={revokeShare.isPending}
        onClick={handleRevoke}
      >
        {revokeShare.isPending ? "링크를 끊는 중" : "이 링크 끊기"}
      </button>
    </>
  );
}

export default ShareLinkResult;
