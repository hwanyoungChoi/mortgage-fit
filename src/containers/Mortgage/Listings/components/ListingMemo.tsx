import ChevronDown from "lucide-react/icons/chevron-down";
import { useEffect, useId, useRef, useState } from "react";

import MaskedValue from "@/components/MaskedValue";

import styles from "./ListingMemo.module.css";

type ListingMemoProps = {
  memo: string;
  /** 가리기 모드: 메모를 가리고 펼치기 버튼도 숨긴다 */
  isMasked: boolean;
};

/** 접었을 때 보이는 줄 수. 넘는 메모만 펼치기 버튼을 둔다. */
const COLLAPSED_LINES = 3;

/** 실제로 그린 높이가 접은 줄 수보다 높은지. 줄바꿈이 많은 짧은 메모와 한 줄이 긴 메모를 똑같이 잰다. */
function isTallerThanLines(element: HTMLElement, lines: number): boolean {
  const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
  return element.scrollHeight > lineHeight * lines + 1;
}

/**
 * 카드의 메모 우물. 처음에는 3줄까지 보이고, 넘는 메모는 우물 안의 [펼치기]로 전부 보이고 [접기]로 다시 접는다.
 * 펼친 상태는 이 카드에서만 기억한다(새로고침·간단히 보기에서 접으면 다시 접힌다). 화면 폭이 바뀌면 다시 잰다.
 */
function ListingMemo({ memo, isMasked }: ListingMemoProps) {
  const textId = useId();
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isLong, setIsLong] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const canToggle = isLong && !isMasked;

  // 메모나 가리기가 바뀌면 다시 구독해 처음 알림으로 잰다.
  useEffect(() => {
    const element = textRef.current;
    if (element === null) return;
    const observer = new ResizeObserver(() =>
      setIsLong(isTallerThanLines(element, COLLAPSED_LINES)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [memo, isMasked]);

  return (
    <div className={styles.memo}>
      <div className={styles.header}>
        <span className={styles.label}>메모</span>
        {canToggle && (
          <button
            type="button"
            className={styles.toggle}
            aria-label={isExpanded ? "메모 접기" : "메모 펼치기"}
            aria-expanded={isExpanded}
            aria-controls={textId}
            onClick={() => setIsExpanded((isOpen) => !isOpen)}
          >
            {isExpanded ? "접기" : "펼치기"}
            <ChevronDown
              className={isExpanded ? styles.chevronOpen : styles.chevron}
              size={14}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
      <p ref={textRef} id={textId} className={isExpanded ? styles.text : styles.collapsedText}>
        <MaskedValue isMasked={isMasked}>{memo}</MaskedValue>
      </p>
    </div>
  );
}

export default ListingMemo;
