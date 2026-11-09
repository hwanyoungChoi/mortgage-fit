import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { currentSheetHistoryId, pushSheetHistoryEntry } from "@/lib/utils/sheetHistory";

import styles from "./Sheet.module.css";

/** 손잡이를 이만큼(시트 높이 비율) 넘게 내리거나 */
const DISMISS_DISTANCE_RATIO = 0.25;
/** 이 속도(px/ms)보다 빠르게 튕겨 내리면 닫는다(Vaul과 같은 기준). 아니면 제자리로 돌아간다 */
const DISMISS_VELOCITY = 0.4;

type DragStart = { pointerId: number; y: number; time: number };

type SheetProps = {
  title: string;
  /** Esc·닫기 버튼·뒤로 가기·바깥 누르기·손잡이 끌어 내리기. 열고 닫기·포커스 복귀·뒤 화면 inert·이력 항목은 `useOpenSheet`가 맡는다. */
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
  const dragStartRef = useRef<DragStart | null>(null);
  // 바깥(어두운 막)에서 누르기 시작했는지. 시트 안에서 눌러 바깥에서 뗀 것(글자 선택 등)은 닫지 않는다.
  const isBackdropPressRef = useRef(false);
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

  const handleBackdropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    isBackdropPressRef.current = event.target === event.currentTarget;
  };
  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isBackdropPressRef.current && event.target === event.currentTarget) onClose();
    isBackdropPressRef.current = false;
  };

  // 손잡이·제목 줄을 끌어 내리면 시트가 손가락을 따라오고, 놓을 때 기준을 넘었으면 닫기 요청을 한다.
  // 확인을 취소했거나 기준에 못 미치면 제자리로 돌아간다. 닫혔으면 시트가 사라져 되돌릴 것이 없다.
  const handleGrabPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    if ((event.target as Element).closest("button") !== null) return;
    dragStartRef.current = { pointerId: event.pointerId, y: event.clientY, time: event.timeStamp };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleGrabPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    const sheet = dialogRef.current;
    if (start === null || sheet === null || start.pointerId !== event.pointerId) return;
    const offset = Math.max(0, event.clientY - start.y);
    sheet.style.transition = "none";
    sheet.style.transform = `translateY(${offset}px)`;
  };
  const settle = () => {
    const sheet = dialogRef.current;
    if (sheet === null) return;
    sheet.style.transition = "";
    sheet.style.transform = "";
  };
  const handleGrabPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    const sheet = dialogRef.current;
    dragStartRef.current = null;
    if (start === null || sheet === null || start.pointerId !== event.pointerId) return;
    const offset = Math.max(0, event.clientY - start.y);
    const velocity = offset / Math.max(1, event.timeStamp - start.time);
    const isDismiss =
      offset > sheet.offsetHeight * DISMISS_DISTANCE_RATIO ||
      (offset > 0 && velocity > DISMISS_VELOCITY);
    if (!isDismiss) {
      settle();
      return;
    }
    onClose();
    // 닫혔으면 다음 그리기 전에 시트가 사라진다. 남아 있으면(확인 취소) 제자리로.
    requestAnimationFrame(settle);
  };

  return (
    // 바깥 누르기는 포인터 보조 수단이다. 키보드·보조기기는 Esc와 [닫기]로 닫는다.
    <div
      className={styles.backdrop}
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div
          className={styles.grabArea}
          onPointerDown={handleGrabPointerDown}
          onPointerMove={handleGrabPointerMove}
          onPointerUp={handleGrabPointerUp}
          onPointerCancel={() => {
            dragStartRef.current = null;
            settle();
          }}
        >
          <span className={styles.handle} aria-hidden="true" />
          <div className={styles.titleRow}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <button type="button" className={styles.closeButton} onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export default Sheet;
