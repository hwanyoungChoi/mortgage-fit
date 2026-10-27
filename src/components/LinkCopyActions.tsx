import { useState } from "react";

import styles from "./SheetBody.module.css";

type LinkCopyActionsProps = {
  url: string;
  /** 입력칸의 보조기기 이름 */
  label: string;
  /** 공유하기(Web Share) 창의 제목 */
  shareTitle: string;
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * 만든 링크와 [복사]·[공유하기]. 입력칸은 포커스하면 전체 선택되어 직접 복사할 수 있다(비보안 주소에는 clipboard가 없다).
 * 공유 링크와 함께 쓰기 초대가 같이 쓴다.
 */
function LinkCopyActions({ url, label, shareTitle }: LinkCopyActionsProps) {
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const canCopy = "clipboard" in navigator;
  const canShare = "share" in navigator;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setLinkMessage("복사했습니다");
    } catch {
      setLinkMessage("복사하지 못했습니다. 링크를 길게 눌러 직접 복사하세요");
    }
  };

  const handleShare = async () => {
    try {
      await navigator.share({ title: shareTitle, url });
    } catch (error) {
      // 사용자가 공유 창을 닫은 것은 오류가 아니다.
      if (!isAbortError(error)) setLinkMessage("공유하지 못했습니다. 링크를 복사해 보내 주세요");
    }
  };

  return (
    <>
      <input
        className={styles.linkInput}
        type="text"
        readOnly
        aria-label={label}
        value={url}
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
      />
      {(canCopy || canShare) && (
        <div className={styles.actions}>
          {canCopy && (
            <button type="button" className={styles.secondaryButton} onClick={handleCopy}>
              복사
            </button>
          )}
          {canShare && (
            <button type="button" className={styles.primaryButton} onClick={handleShare}>
              공유하기
            </button>
          )}
        </div>
      )}
      <div role="status" className={styles.status}>
        {linkMessage}
      </div>
    </>
  );
}

export default LinkCopyActions;
