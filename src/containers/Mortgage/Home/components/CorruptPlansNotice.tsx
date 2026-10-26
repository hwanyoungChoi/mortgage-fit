import { useState } from "react";

import styles from "./CorruptPlansNotice.module.css";

import type { StorageWriteResult } from "@/lib/types/storage";

type CorruptPlansNoticeProps = {
  rawText: string;
  onReset: () => StorageWriteResult;
};

const RESET_CONFIRM_MESSAGE =
  "손상된 인테리어 계획 데이터를 삭제하고 빈 상태로 시작합니다. 되돌릴 수 없으니 원문을 먼저 복사하세요";

/**
 * 플랜 저장 원문이 손상됐을 때. 저장 목록의 손상 안내와 같은 규칙이다(ADR-001): 원문을 챙길 수 있게 하고,
 * 초기화는 사용자가 확인한 뒤에만 한다. 지우는 것은 플랜 키 하나뿐이다(다른 키는 건드리지 않는다).
 */
function CorruptPlansNotice({ rawText, onReset }: CorruptPlansNoticeProps) {
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  // http://192.168.x.x 같은 비보안 주소에서는 clipboard API가 없다. 그때는 아래 원문을 직접 복사한다.
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawText);
      setCopyMessage("원문을 복사했습니다");
    } catch {
      setCopyMessage("복사하지 못했습니다. 아래 원문을 길게 눌러 직접 복사하세요");
    }
  };

  const handleReset = () => {
    if (!window.confirm(RESET_CONFIRM_MESSAGE)) return;
    const result = onReset();
    setResetError(
      result.ok ? null : "초기화하지 못했습니다. 이 브라우저에서 저장소를 사용할 수 없습니다",
    );
  };

  return (
    <section className={styles.notice} aria-labelledby="corrupt-plans-title">
      <h2 id="corrupt-plans-title" className={styles.title}>
        저장된 인테리어 계획이 손상되어 불러올 수 없습니다
      </h2>
      <p className={styles.description}>
        원문을 복사해 보관한 뒤 초기화하세요. 초기화하기 전에는 계획을 만들거나 고칠 수 없습니다.
        계산과 저장 목록은 그대로 쓸 수 있습니다.
      </p>
      <textarea
        className={styles.rawText}
        aria-label="손상된 계획 원문"
        readOnly
        rows={4}
        value={rawText}
      />
      {copyMessage !== null && (
        <p role="status" className={styles.status}>
          {copyMessage}
        </p>
      )}
      {resetError !== null && (
        <p role="alert" className={styles.error}>
          {resetError}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} onClick={handleCopy}>
          원문 복사
        </button>
        <button type="button" className={styles.dangerButton} onClick={handleReset}>
          계획 초기화
        </button>
      </div>
    </section>
  );
}

export default CorruptPlansNotice;
