import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { currentSheetHistoryId, pushSheetHistoryEntry } from "@/lib/utils/sheetHistory";

import styles from "./Sheet.module.css";

type SheetProps = {
  title: string;
  /** Esc·닫기 버튼·뒤로 가기. 열고 닫기·포커스 복귀·뒤 화면 inert·이력 항목은 `useOpenSheet`가 맡는다. */
  onClose: () => void;
  children: ReactNode;
};

/**
 * 하단 시트 공통 프레임(계산 화면, 저장 목록, 우리 집, 글자 크기). 뒤로 가기는 이전 화면이 아니라 이 시트를 닫는다
 * (모바일 관례, 스펙 interior-tbd-amount "추가 요청"). 높이는 뷰포트의 90% 안이고, 넘치는 내용은 시트 안에서 스크롤한다.
 */
function Sheet({ title, onClose, children }: SheetProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // 열 때 `useOpenSheet`가 쌓은 이력 항목과 그 주소. 시트를 바꿔 열어도(계획 관리 → 만들기) 같은 항목이다.
  const [historyEntry] = useState(() => ({
    id: currentSheetHistoryId(),
    href: window.location.href,
  }));

  // 보조기기가 시트를 읽기 시작하도록 포커스를 안으로 옮긴다. 안쪽 칸이 autoFocus로 이미 가져갔으면 둔다.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.contains(document.activeElement)) dialog.focus();
  }, []);

  // 누른 버튼이 사라지면("더 보기") 포커스가 body로 빠진다. 그때도 Esc가 닫도록 문서에서 듣는다.
  // 뒤로 가기도 같은 onClose라 고친 내용이 있으면 같은 확인을 거친다.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // 이 시트의 항목에서 같은 주소로 물러났을 때만 닫기 요청이다. 탭 이동(replace)처럼 주소가 바뀐 것은 화면이 바뀌며 끝난다.
    // 항목을 먼저 다시 쌓는다: 확인을 취소하면 시트가 남고, 닫으면 `useOpenSheet`가 그 항목을 되돌린다.
    const handlePopState = () => {
      const { id, href } = historyEntry;
      if (id === null || currentSheetHistoryId() === id || window.location.href !== href) return;
      pushSheetHistoryEntry(id);
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [onClose, historyEntry]);

  return (
    <div className={styles.backdrop}>
      <div
        ref={dialogRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.titleRow}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            닫기
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default Sheet;
